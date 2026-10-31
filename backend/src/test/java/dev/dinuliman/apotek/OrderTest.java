package dev.dinuliman.apotek;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;

import com.jayway.jsonpath.JsonPath;
import dev.dinuliman.apotek.auth.CurrentUser;
import dev.dinuliman.apotek.orders.Orders;
import dev.dinuliman.apotek.prescriptions.Prescriptions;
import dev.dinuliman.apotek.web.ApiException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class OrderTest extends ApiTest {

	@Autowired Orders orders;
	@Autowired Prescriptions prescriptions;

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13 };

	private String place(CurrentUser u, String json) throws Exception {
		var body = mvc.perform(placeOrder(u, json)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.number");
	}

	@Test
	void stockComesFromTheEarliestBatchThatIsStillSellable() throws Exception {
		var u = customer();
		mvc.perform(placeOrder(u, orderJson(line("ibuprofen-400", 2), null)))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT"))
			.andExpect(jsonPath("$.subtotal").value(25_000)).andExpect(jsonPath("$.shippingFee").value(15_000)).andExpect(jsonPath("$.total").value(40_000))
			// IB-2501 expires first but within 30 days, so it is skipped.
			.andExpect(jsonPath("$.items[0].batches[0].batchNo").value("IB-2507"));
		assertThat(batchQty("IB-2501")).isEqualTo(40);
		assertThat(batchQty("IB-2507")).isEqualTo(58);
	}

	@Test
	void anOrderCanSpanTwoBatches() throws Exception {
		db.sql("update batches set qty_available = 5 where batch_no = 'IB-2507'").update();
		db.sql("insert into batches (product_id, batch_no, expiry_date, qty_received, qty_available) values (?, 'IB-2602', current_date + 500, 50, 50)").param(productId("ibuprofen-400")).update();
		mvc.perform(placeOrder(customer(), orderJson(line("ibuprofen-400", 3), null))).andExpect(status().isCreated());
		mvc.perform(placeOrder(customer(), orderJson(line("ibuprofen-400", 3), null)))
			.andExpect(jsonPath("$.items[0].batches", hasSize(2)))
			.andExpect(jsonPath("$.items[0].batches[0].batchNo").value("IB-2507")).andExpect(jsonPath("$.items[0].batches[0].qty").value(2))
			.andExpect(jsonPath("$.items[0].batches[1].batchNo").value("IB-2602")).andExpect(jsonPath("$.items[0].batches[1].qty").value(1));
	}

	@Test
	void shippingIsFreeFromRp150000() throws Exception {
		mvc.perform(placeOrder(customer(), orderJson(line("blood-pressure-aneroid", 1), null)))
			.andExpect(jsonPath("$.shippingFee").value(0)).andExpect(jsonPath("$.total").value(285_000));
	}

	@Test
	void limitedMedicinesHaveAPerOrderCap() throws Exception {
		var u = customer();
		mvc.perform(placeOrder(u, orderJson(line("cetirizine-10", 3), null)))
			.andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.code").value("invalid"));
		// Two lines of the same product are added up before the cap is checked.
		mvc.perform(placeOrder(u, orderJson(line("cetirizine-10", 2) + "," + line("cetirizine-10", 1), null))).andExpect(status().isUnprocessableContent());
		mvc.perform(placeOrder(u, orderJson("{\"productId\":999999,\"qty\":1}", null))).andExpect(status().isUnprocessableContent());
		assertThat(db.sql("select count(*) from orders").query(Integer.class).single()).isZero();
	}

	@Test
	void aRetriedCheckoutDoesNotOrderTwice() throws Exception {
		var u = customer();
		String key = UUID.randomUUID().toString();
		String json = orderJson(line("paracetamol-500", 4), null);
		String first = mvc.perform(post("/api/orders", u, json).header("Idempotency-Key", key)).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
		mvc.perform(post("/api/orders", u, json).header("Idempotency-Key", key))
			.andExpect(status().isOk()).andExpect(header().string("Idempotent-Replayed", "true"))
			.andExpect(jsonPath("$.number").value((String) JsonPath.read(first, "$.number")));
		assertThat(db.sql("select sum(qty_received - qty_available) from batches where product_id = ?").param(productId("paracetamol-500")).query(Integer.class).single()).isEqualTo(4);
		mvc.perform(post("/api/orders", customer(), json).header("Idempotency-Key", key)).andExpect(status().isUnprocessableContent());
		mvc.perform(post("/api/orders", u, json)).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("missing_header"));
	}

	@Test
	void prescriptionMedicinesGoThroughAPharmacist() throws Exception {
		var u = customer();
		var apt = pharmacist();
		mvc.perform(placeOrder(u, orderJson(line("amoxicillin-500", 1), null)))
			.andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.code").value("prescription_required"));
		long othersRx = prescriptions.store(customer().id(), PNG, "").id();
		mvc.perform(placeOrder(u, orderJson(line("amoxicillin-500", 1), othersRx))).andExpect(status().isUnprocessableContent());

		long rx = prescriptions.store(u.id(), PNG, "dr. Contoh").id();
		String number = place(u, orderJson(line("amoxicillin-500", 1) + "," + line("paracetamol-500", 1), rx));
		mvc.perform(get("/api/orders/" + number, u)).andExpect(jsonPath("$.status").value("AWAITING_REVIEW")).andExpect(jsonPath("$.needsPrescription").value(true));
		mvc.perform(post("/api/orders/" + number + "/pay", u, null)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("wrong_status"));
		mvc.perform(post("/api/admin/orders/" + number + "/review", u, "{\"approve\":true}")).andExpect(status().isForbidden());

		mvc.perform(post("/api/admin/orders/" + number + "/review", apt, "{\"approve\":true,\"note\":\"Matches the doctor's prescription\"}"))
			.andExpect(jsonPath("$.status").value("AWAITING_PAYMENT")).andExpect(jsonPath("$.reviewedBy").value("Test PHARMACIST"));
		mvc.perform(post("/api/orders/" + number + "/pay", u, null)).andExpect(jsonPath("$.status").value("PAID"));
		mvc.perform(post("/api/admin/orders/" + number + "/ship", apt, "{\"trackingNo\":\"x\"}")).andExpect(status().isUnprocessableContent());
		mvc.perform(post("/api/admin/orders/" + number + "/ship", apt, "{\"trackingNo\":\"JNE-0012345\"}")).andExpect(jsonPath("$.status").value("SHIPPED"));
		mvc.perform(post("/api/admin/orders/" + number + "/deliver", apt, null))
			.andExpect(jsonPath("$.status").value("DELIVERED"))
			.andExpect(jsonPath("$.events[*].type", org.hamcrest.Matchers.contains("PLACED", "APPROVED", "PAID", "SHIPPED", "DELIVERED")));
	}

	@Test
	void aPrescriptionServesOneOrderAtATime() throws Exception {
		var u = customer();
		long rx = prescriptions.store(u.id(), PNG, "").id();
		String first = place(u, orderJson(line("omeprazole-20", 1), rx));
		mvc.perform(placeOrder(u, orderJson(line("amlodipine-5", 1), rx))).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("prescription_in_use"));
		mvc.perform(post("/api/admin/orders/" + first + "/review", pharmacist(), "{\"approve\":false}"))
			.andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.errors.note").exists());
		mvc.perform(post("/api/admin/orders/" + first + "/review", pharmacist(), "{\"approve\":false,\"note\":\"The prescription is for a different medicine\"}"))
			.andExpect(jsonPath("$.status").value("REJECTED"));
		mvc.perform(placeOrder(u, orderJson(line("amlodipine-5", 1), rx))).andExpect(status().isCreated());
	}

	@Test
	void rejectingOrCancellingPutsStockBackInTheSameBatches() throws Exception {
		var u = customer();
		var before = db.sql("select batch_no, qty_available from batches where product_id = ? order by id").param(productId("omeprazole-20")).query().listOfRows();
		long rx = prescriptions.store(u.id(), PNG, "").id();
		String a = place(u, orderJson(line("omeprazole-20", 5), rx));
		mvc.perform(post("/api/admin/orders/" + a + "/review", pharmacist(), "{\"approve\":false,\"note\":\"Prescription has expired\"}"));
		String b = place(u, orderJson(line("paracetamol-500", 3), null));
		mvc.perform(post("/api/orders/" + b + "/cancel", u, null)).andExpect(jsonPath("$.status").value("CANCELLED"));
		mvc.perform(post("/api/orders/" + b + "/cancel", u, null)).andExpect(status().isConflict());
		assertThat(db.sql("select batch_no, qty_available from batches where product_id = ? order by id").param(productId("omeprazole-20")).query().listOfRows()).isEqualTo(before);
		assertThat(db.sql("select sum(qty_received - qty_available) from batches where product_id = ?").param(productId("paracetamol-500")).query(Integer.class).single()).isZero();
	}

	@Test
	void unpaidOrdersExpireAndReleaseTheirStock() throws Exception {
		var u = customer();
		String a = place(u, orderJson(line("vitamin-c-1000", 2), null));
		String b = place(u, orderJson(line("vitamin-c-1000", 1), null));
		mvc.perform(post("/api/orders/" + b + "/pay", u, null)).andExpect(status().isOk());
		clock.advance(Duration.ofHours(25));
		mvc.perform(post("/api/orders/" + a + "/pay", u, null)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("payment_window_closed"));
		assertThat(orders.expireUnpaid()).isEqualTo(1);
		mvc.perform(get("/api/orders/" + a, u)).andExpect(jsonPath("$.status").value("CANCELLED")).andExpect(jsonPath("$.events[1].type").value("EXPIRED"));
		mvc.perform(get("/api/orders/" + b, u)).andExpect(jsonPath("$.status").value("PAID"));
		assertThat(db.sql("select sum(qty_received - qty_available) from batches where product_id = ?").param(productId("vitamin-c-1000")).query(Integer.class).single()).isEqualTo(1);
	}

	@Test
	void customersOnlySeeTheirOwnOrders() throws Exception {
		var u = customer();
		String n = place(u, orderJson(line("paracetamol-500", 1), null));
		mvc.perform(get("/api/orders/" + n, customer())).andExpect(status().isNotFound());
		mvc.perform(post("/api/orders/" + n + "/cancel", customer(), null)).andExpect(status().isNotFound());
		mvc.perform(get("/api/orders", u)).andExpect(jsonPath("$", hasSize(1)));
	}

	/** 30 customers race for the last 12 bottles: exactly 12 orders go through and stock ends at zero. */
	@Test
	void theLastUnitsCannotBeSoldTwice() throws Exception {
		long product = productId("vitamin-d3-drops");
		var buyers = new java.util.ArrayList<CurrentUser>();
		for (int i = 0; i < 30; i++) buyers.add(customer());
		var start = new CountDownLatch(1);
		var results = new ConcurrentHashMap<String, Integer>();
		var pool = Executors.newFixedThreadPool(30);
		{
			for (var b : buyers) {
				pool.submit(() -> {
					start.await();
					try {
						orders.place(b.id(), UUID.randomUUID(), new Orders.Place(List.of(new Orders.Line(product, 1)), "A", "081234567890", "Jl. Kenanga No. 12", "Jakarta", "12810", null));
						results.merge("ok", 1, Integer::sum);
					} catch (ApiException e) {
						results.merge(e.code(), 1, Integer::sum);
					}
					return null;
				});
			}
			start.countDown();
		}
		pool.shutdown();
		assertThat(pool.awaitTermination(60, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
		assertThat(results).containsEntry("ok", 12).containsEntry("out_of_stock", 18);
		assertThat(db.sql("select qty_available from batches where product_id = ?").param(product).query(Integer.class).single()).isZero();
	}

	/** The batch quantity always equals the sum of its ledger entries. */
	@Test
	void theStockLedgerAddsUp() throws Exception {
		var u = customer();
		String a = place(u, orderJson(line("paracetamol-500", 7) + "," + line("medical-masks", 2), null));
		place(u, orderJson(line("paracetamol-500", 3), null));
		mvc.perform(post("/api/orders/" + a + "/cancel", u, null));
		var mismatches = db.sql("""
				select b.batch_no from batches b left join stock_movements m on m.batch_id = b.id
				group by b.id having b.qty_available <> coalesce(sum(m.delta), 0)""").query(String.class).list();
		assertThat(mismatches).isEmpty();
	}

}
