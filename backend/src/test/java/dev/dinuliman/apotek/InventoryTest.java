package dev.dinuliman.apotek;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;

class InventoryTest extends ApiTest {

	@Test
	void receivingABatchAddsSellableStock() throws Exception {
		var apt = pharmacist();
		long id = productId("budesonide-inhaler");
		String exp = LocalDate.now().plusMonths(18).toString();
		mvc.perform(post("/api/admin/inventory/" + id + "/batches", apt, "{\"batchNo\":\"bd-2611\",\"expiryDate\":\"" + exp + "\",\"qty\":40}"))
			.andExpect(status().isCreated()).andExpect(jsonPath("$.batchNo").value("BD-2611")).andExpect(jsonPath("$.status").value("SELLABLE"));
		mvc.perform(get("/api/products/budesonide-inhaler", null)).andExpect(jsonPath("$.available").value(43));
		mvc.perform(post("/api/admin/inventory/" + id + "/batches", apt, "{\"batchNo\":\"BD-2611\",\"expiryDate\":\"" + exp + "\",\"qty\":5}"))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("duplicate_batch"));
		mvc.perform(post("/api/admin/inventory/" + id + "/batches", apt, "{\"batchNo\":\"BD-OLD\",\"expiryDate\":\"" + LocalDate.now().minusDays(1) + "\",\"qty\":5}"))
			.andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.errors.expiryDate").exists());
		mvc.perform(post("/api/admin/inventory/" + id + "/batches", apt, "{\"batchNo\":\"no spaces!\",\"expiryDate\":\"" + exp + "\",\"qty\":0}"))
			.andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.errors.batchNo").exists()).andExpect(jsonPath("$.errors.qty").exists());
		mvc.perform(post("/api/admin/inventory/" + id + "/batches", customer(), "{\"batchNo\":\"X1\",\"expiryDate\":\"" + exp + "\",\"qty\":1}")).andExpect(status().isForbidden());
	}

	@Test
	void expiredStockIsReportedAndWrittenOff() throws Exception {
		var apt = pharmacist();
		String body = mvc.perform(get("/api/admin/inventory/expiring?days=30", apt)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<java.util.List<String>>read(body, "$[*].batchNo")).containsExactly("CT-2412", "IB-2501");
		assertThat(JsonPath.<Integer>read(body, "$[0].daysLeft")).isEqualTo(-10);
		int expired = JsonPath.read(body, "$[0].batchId");
		int nearExpiry = JsonPath.read(body, "$[1].batchId");
		mvc.perform(post("/api/admin/batches/" + nearExpiry + "/write-off", apt, null)).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("not_expired"));
		mvc.perform(post("/api/admin/batches/" + expired + "/write-off", apt, null)).andExpect(jsonPath("$.qtyAvailable").value(0)).andExpect(jsonPath("$.status").value("EXPIRED"));
		mvc.perform(post("/api/admin/batches/" + expired + "/write-off", apt, null)).andExpect(status().isConflict());
		assertThat(db.sql("select delta from stock_movements where batch_id = ? and reason = 'WRITTEN_OFF'").param(expired).query(Integer.class).single()).isEqualTo(-15);
	}

	@Test
	void theOverviewFlagsLowAndExpiredStock() throws Exception {
		String body = mvc.perform(get("/api/admin/inventory", pharmacist())).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<java.util.List<Boolean>>read(body, "$[?(@.name == 'Budesonide Inhaler 200 mcg')].low")).containsExactly(true);
		assertThat(JsonPath.<java.util.List<Integer>>read(body, "$[?(@.name == 'Cetirizine 10 mg')].expiredOnHand")).containsExactly(15);
		assertThat(JsonPath.<java.util.List<Integer>>read(body, "$[?(@.name == 'Ibuprofen 400 mg')].sellable")).containsExactly(60);
	}

}
