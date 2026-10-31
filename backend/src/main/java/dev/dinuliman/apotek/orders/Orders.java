package dev.dinuliman.apotek.orders;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

import dev.dinuliman.apotek.catalog.Catalog;
import dev.dinuliman.apotek.catalog.Product;
import dev.dinuliman.apotek.config.AppProperties;
import dev.dinuliman.apotek.inventory.Inventory;
import dev.dinuliman.apotek.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Order lifecycle:
 *   no prescription medicine:  AWAITING_PAYMENT -> PAID -> SHIPPED -> DELIVERED
 *   with prescription medicine: AWAITING_REVIEW -> (pharmacist) AWAITING_PAYMENT ... or REJECTED
 *   AWAITING_REVIEW / AWAITING_PAYMENT -> CANCELLED by the customer or when the payment window runs out.
 * Stock is taken when the order is placed and returned to the same batches on rejection or cancellation.
 */
@Service
public class Orders {

	public record Line(long productId, int qty) {
	}

	public record Place(List<Line> items, String recipient, String phone, String address, String city, String postalCode, Long prescriptionId) {
	}

	static final int MAX_LINES = 30;
	static final int MAX_QTY = 20;

	private final JdbcClient db;
	private final Clock clock;
	private final AppProperties props;
	private final Catalog catalog;
	private final Inventory inventory;

	Orders(JdbcClient db, Clock clock, AppProperties props, Catalog catalog, Inventory inventory) {
		this.db = db;
		this.clock = clock;
		this.props = props;
		this.catalog = catalog;
		this.inventory = inventory;
	}

	private Timestamp now() { return Timestamp.from(clock.instant()); }

	/** The order already created with this key, if any. Keys belong to one customer. */
	public Optional<OrderView> replay(UUID key, long customerId) {
		var row = db.sql("select id, customer_id from orders where idempotency_key = ?").param(key)
			.query((rs, n) -> new long[] { rs.getLong(1), rs.getLong(2) }).optional();
		if (row.isEmpty()) return Optional.empty();
		if (row.get()[1] != customerId) throw ApiException.invalid("This Idempotency-Key was already used.", Map.of());
		return Optional.of(view(row.get()[0]));
	}

	@Transactional
	public OrderView place(long customerId, UUID key, Place in) {
		// Merge repeated lines and sort by product id, so concurrent orders lock batches in the same order.
		var qty = new TreeMap<Long, Integer>();
		if (in.items() == null || in.items().isEmpty() || in.items().size() > MAX_LINES) {
			throw ApiException.invalid("An order needs 1 to " + MAX_LINES + " items.", Map.of("items", "1 to " + MAX_LINES));
		}
		for (var l : in.items()) qty.merge(l.productId(), l.qty(), Integer::sum);
		var products = catalog.byIds(qty.keySet());
		var problems = new LinkedHashMap<String, String>();
		boolean needsRx = false;
		long subtotal = 0;
		for (var e : qty.entrySet()) {
			Product p = products.get(e.getKey());
			String key2 = "items[" + e.getKey() + "]";
			if (p == null || !p.active()) { problems.put(key2, "unknown or unavailable product"); continue; }
			int n = e.getValue();
			if (n < 1 || n > MAX_QTY) { problems.put(key2, "quantity must be 1 to " + MAX_QTY); continue; }
			if (p.maxPerOrder() != null && n > p.maxPerOrder()) {
				problems.put(key2, p.name() + " is limited to " + p.maxPerOrder() + " per order");
				continue;
			}
			needsRx |= p.needsPrescription();
			subtotal += p.price() * n;
		}
		if (!problems.isEmpty()) throw ApiException.invalid("Some items cannot be ordered.", problems);

		Long rx = null;
		if (needsRx) {
			if (in.prescriptionId() == null) {
				throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "prescription_required", "Prescription medicines need a prescription. Upload one at checkout.");
			}
			Long owner = db.sql("select owner_id from prescriptions where id = ?").param(in.prescriptionId()).query(Long.class).optional().orElse(null);
			if (owner == null || owner != customerId) {
				throw ApiException.invalid("That prescription was not found.", Map.of("prescriptionId", "not found"));
			}
			boolean used = db.sql("select exists(select 1 from orders where prescription_id = ? and status not in ('REJECTED', 'CANCELLED'))")
				.param(in.prescriptionId()).query(Boolean.class).single();
			if (used) throw ApiException.conflict("prescription_in_use", "This prescription is already attached to another order.");
			rx = in.prescriptionId();
		}

		long shipping = subtotal >= props.freeShippingFrom() ? 0 : props.shippingFee();
		long seq = db.sql("select nextval('order_number_seq')").query(Long.class).single();
		String number = String.format("TD-%s-%05d", LocalDate.now(clock).format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE).substring(2), seq);
		String status = needsRx ? "AWAITING_REVIEW" : "AWAITING_PAYMENT";
		Timestamp due = needsRx ? null : Timestamp.from(clock.instant().plus(props.paymentWindow()));
		long orderId = db.sql("""
				insert into orders (number, customer_id, status, recipient, phone, address, city, postal_code, subtotal, shipping_fee, total,
				  prescription_id, idempotency_key, created_at, payment_due_at)
				values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) returning id""")
			.params(number, customerId, status, in.recipient().trim(), in.phone().trim(), in.address().trim(), in.city().trim(), in.postalCode().trim(),
				subtotal, shipping, subtotal + shipping, rx, key, now(), due)
			.query(Long.class).single();
		for (var e : qty.entrySet()) {
			Product p = products.get(e.getKey());
			long itemId = db.sql("insert into order_items (order_id, product_id, name, drug_class, unit_price, qty, line_total) values (?, ?, ?, ?, ?, ?, ?) returning id")
				.params(orderId, p.id(), p.name(), p.drugClass(), p.price(), e.getValue(), p.price() * e.getValue()).query(Long.class).single();
			inventory.allocate(p.id(), p.name(), e.getValue(), orderId, itemId);
		}
		event(orderId, customerId, "PLACED", needsRx ? "Waiting for a pharmacist to check the prescription" : "");
		return view(orderId);
	}

	/** Locks the order row and checks it is in one of the allowed states. */
	private long lock(String number, Long customerId, String... allowed) {
		var row = db.sql("select id, customer_id, status from orders where number = ? for update").param(number)
			.query((rs, n) -> new Object[] { rs.getLong(1), rs.getLong(2), rs.getString(3) }).optional()
			.filter(r -> customerId == null || (long) r[1] == customerId)
			.orElseThrow(ApiException::notFound);
		String status = (String) row[2];
		if (!List.of(allowed).contains(status)) {
			throw ApiException.conflict("wrong_status", "This order is " + status.toLowerCase().replace('_', ' ') + ".");
		}
		return (long) row[0];
	}

	private void setStatus(long id, String status) {
		db.sql("update orders set status = ? where id = ?").params(status, id).update();
	}

	private void event(long orderId, Long actor, String type, String note) {
		db.sql("insert into order_events (order_id, at, actor_id, type, note) values (?, ?, ?, ?, ?)").params(orderId, now(), actor, type, note).update();
	}

	@Transactional
	public OrderView review(String number, long pharmacistId, boolean approve, String note) {
		long id = lock(number, null, "AWAITING_REVIEW");
		String text = note == null ? "" : note.trim();
		if (!approve && text.length() < 5) {
			throw ApiException.invalid("Tell the customer why the prescription was not accepted.", Map.of("note", "at least 5 characters"));
		}
		db.sql("update orders set review_note = ?, reviewed_by = ?, reviewed_at = ? where id = ?").params(text, pharmacistId, now(), id).update();
		if (approve) {
			db.sql("update orders set status = 'AWAITING_PAYMENT', payment_due_at = ? where id = ?")
				.params(Timestamp.from(clock.instant().plus(props.paymentWindow())), id).update();
			event(id, pharmacistId, "APPROVED", text);
		} else {
			setStatus(id, "REJECTED");
			inventory.release(id, pharmacistId);
			event(id, pharmacistId, "REJECTED", text);
		}
		return view(id);
	}

	/** Records payment. The demo has no payment gateway; this stands in for its confirmation. */
	@Transactional
	public OrderView pay(String number, long customerId) {
		long id = lock(number, customerId, "AWAITING_PAYMENT");
		Instant due = db.sql("select payment_due_at from orders where id = ?").param(id).query(Timestamp.class).single().toInstant();
		if (clock.instant().isAfter(due)) throw ApiException.conflict("payment_window_closed", "The time to pay for this order has passed.");
		db.sql("update orders set status = 'PAID', paid_at = ? where id = ?").params(now(), id).update();
		event(id, customerId, "PAID", "");
		return view(id);
	}

	@Transactional
	public OrderView cancel(String number, long customerId) {
		long id = lock(number, customerId, "AWAITING_REVIEW", "AWAITING_PAYMENT");
		setStatus(id, "CANCELLED");
		inventory.release(id, customerId);
		event(id, customerId, "CANCELLED", "Cancelled by the customer");
		return view(id);
	}

	@Transactional
	public OrderView ship(String number, long pharmacistId, String trackingNo) {
		long id = lock(number, null, "PAID");
		db.sql("update orders set status = 'SHIPPED', tracking_no = ? where id = ?").params(trackingNo.trim(), id).update();
		event(id, pharmacistId, "SHIPPED", "Tracking number " + trackingNo.trim());
		return view(id);
	}

	@Transactional
	public OrderView deliver(String number, long pharmacistId) {
		long id = lock(number, null, "SHIPPED");
		setStatus(id, "DELIVERED");
		event(id, pharmacistId, "DELIVERED", "");
		return view(id);
	}

	/** Cancels orders whose payment window has passed and returns their stock. Returns how many. */
	@Transactional
	public int expireUnpaid() {
		var ids = db.sql("select id from orders where status = 'AWAITING_PAYMENT' and payment_due_at < ? order by id for update skip locked")
			.param(now()).query(Long.class).list();
		for (long id : ids) {
			setStatus(id, "CANCELLED");
			inventory.release(id, null);
			event(id, null, "EXPIRED", "Not paid in time; the items went back on the shelf");
		}
		return ids.size();
	}

	public List<OrderView> mine(long customerId) {
		return views(db.sql("select id from orders where customer_id = ? order by created_at desc, id desc limit 50").param(customerId).query(Long.class).list());
	}

	public OrderView mine(String number, long customerId) {
		return db.sql("select id from orders where number = ? and customer_id = ?").params(number, customerId).query(Long.class).optional()
			.map(this::view).orElseThrow(ApiException::notFound);
	}

	public OrderView byNumber(String number) {
		return db.sql("select id from orders where number = ?").param(number).query(Long.class).optional().map(this::view).orElseThrow(ApiException::notFound);
	}

	public List<OrderView> byStatus(String status) {
		return views(db.sql("select id from orders where (? = '' or status = ?) order by created_at " + ("AWAITING_REVIEW".equals(status) || "PAID".equals(status) ? "asc" : "desc") + ", id limit 100")
			.params(status, status).query(Long.class).list());
	}

	public Map<String, Long> counts() {
		var out = new LinkedHashMap<String, Long>();
		for (var s : List.of("AWAITING_REVIEW", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED")) out.put(s, 0L);
		db.sql("select status, count(*) from orders group by status").query((rs, n) -> out.put(rs.getString(1), rs.getLong(2))).list();
		return out;
	}

	OrderView view(long id) {
		return views(List.of(id)).get(0);
	}

	private List<OrderView> views(List<Long> ids) {
		if (ids.isEmpty()) return List.of();
		var items = new HashMap<Long, List<OrderView.Item>>();
		var batches = new HashMap<Long, List<OrderView.Batch>>();
		db.sql("""
				select a.order_item_id, b.batch_no, b.expiry_date, a.qty from allocations a join batches b on b.id = a.batch_id
				join order_items i on i.id = a.order_item_id where i.order_id in (:ids) order by b.expiry_date""")
			.param("ids", ids).query((rs, n) -> batches.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>())
				.add(new OrderView.Batch(rs.getString(2), rs.getObject(3, LocalDate.class), rs.getInt(4)))).list();
		db.sql("""
				select i.order_id, i.id, i.product_id, p.slug, i.name, i.drug_class, p.image, i.unit_price, i.qty, i.line_total
				from order_items i join products p on p.id = i.product_id where i.order_id in (:ids) order by i.id""")
			.param("ids", ids).query((rs, n) -> items.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>()).add(new OrderView.Item(
				rs.getLong(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7), rs.getLong(8), rs.getInt(9), rs.getLong(10),
				batches.getOrDefault(rs.getLong(2), List.of())))).list();
		var events = new HashMap<Long, List<OrderView.Event>>();
		db.sql("select e.order_id, e.at, e.type, e.note, u.name from order_events e left join users u on u.id = e.actor_id where e.order_id in (:ids) order by e.at, e.id")
			.param("ids", ids).query((rs, n) -> events.computeIfAbsent(rs.getLong(1), k -> new ArrayList<>())
				.add(new OrderView.Event(rs.getTimestamp(2).toInstant(), rs.getString(3), rs.getString(4), rs.getString(5)))).list();
		var byId = new HashMap<Long, OrderView>();
		db.sql("""
				select o.id, o.number, o.status, c.name, c.email, o.recipient, o.phone, o.address, o.city, o.postal_code, o.subtotal, o.shipping_fee, o.total,
				  o.prescription_id, o.review_note, r.name, o.reviewed_at, o.tracking_no, o.created_at, o.payment_due_at, o.paid_at
				from orders o join users c on c.id = o.customer_id left join users r on r.id = o.reviewed_by where o.id in (:ids)""")
			.param("ids", ids).query((rs, n) -> {
				long id = rs.getLong(1);
				var its = items.getOrDefault(id, List.of());
				byId.put(id, new OrderView(id, rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7),
					rs.getString(8), rs.getString(9), rs.getString(10), rs.getLong(11), rs.getLong(12), rs.getLong(13), (Long) rs.getObject(14),
					its.stream().anyMatch(i -> "KERAS".equals(i.drugClass())), rs.getString(15), rs.getString(16), instant(rs.getTimestamp(17)),
					rs.getString(18), instant(rs.getTimestamp(19)), instant(rs.getTimestamp(20)), instant(rs.getTimestamp(21)), its, events.getOrDefault(id, List.of())));
				return id;
			}).list();
		return ids.stream().map(byId::get).toList();
	}

	private static Instant instant(Timestamp t) { return t == null ? null : t.toInstant(); }

}
