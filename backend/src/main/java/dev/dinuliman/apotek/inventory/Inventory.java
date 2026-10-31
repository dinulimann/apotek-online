package dev.dinuliman.apotek.inventory;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import dev.dinuliman.apotek.catalog.Catalog;
import dev.dinuliman.apotek.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Stock lives in batches. Sales take from the batch that expires first (FEFO), skipping batches
 * too close to expiry. Every change is written to the stock_movements ledger.
 */
@Service
public class Inventory {

	public record Batch(long id, long productId, String batchNo, LocalDate expiryDate, int qtyReceived, int qtyAvailable, String status) {
	}

	public record Allocation(long batchId, String batchNo, LocalDate expiryDate, int qty) {
	}

	public record StockRow(long productId, String name, String drugClass, String image, int onHand, int sellable,
			int expiredOnHand, LocalDate nextExpiry, boolean low) {
	}

	public record ExpiringRow(long batchId, long productId, String product, String batchNo, LocalDate expiryDate, int qtyAvailable, long daysLeft) {
	}

	static final int LOW_STOCK = 10;

	private final JdbcClient db;
	private final Clock clock;
	private final Catalog catalog;

	Inventory(JdbcClient db, Clock clock, Catalog catalog) {
		this.db = db;
		this.clock = clock;
		this.catalog = catalog;
	}

	/**
	 * Takes qty of a product from its batches, earliest expiry first. Must run inside the order's
	 * transaction: the batch rows stay locked until it commits, so two orders cannot both take the
	 * last units. Throws out_of_stock if the sellable batches do not cover qty.
	 */
	@Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
	public List<Allocation> allocate(long productId, String productName, int qty, long orderId, long orderItemId) {
		var batches = db.sql("""
				select id, batch_no, expiry_date, qty_available from batches
				where product_id = ? and qty_available > 0 and expiry_date >= ?
				order by expiry_date, id for update""")
			.params(productId, catalog.sellableFrom())
			.query((rs, n) -> new Allocation(rs.getLong(1), rs.getString(2), rs.getObject(3, LocalDate.class), rs.getInt(4))).list();
		int available = batches.stream().mapToInt(Allocation::qty).sum();
		if (available < qty) {
			throw new ApiException(HttpStatus.CONFLICT, "out_of_stock", "Not enough " + productName + " in stock.",
				Map.of("productId", productId, "name", productName, "available", available, "requested", qty));
		}
		var taken = new java.util.ArrayList<Allocation>();
		int left = qty;
		for (var b : batches) {
			if (left == 0) break;
			int take = Math.min(left, b.qty());
			db.sql("update batches set qty_available = qty_available - ? where id = ?").params(take, b.batchId()).update();
			db.sql("insert into allocations (order_item_id, batch_id, qty) values (?, ?, ?)").params(orderItemId, b.batchId(), take).update();
			db.sql("insert into stock_movements (batch_id, delta, reason, order_id) values (?, ?, 'ALLOCATED', ?)").params(b.batchId(), -take, orderId).update();
			taken.add(new Allocation(b.batchId(), b.batchNo(), b.expiryDate(), take));
			left -= take;
		}
		return taken;
	}

	/** Puts an order's stock back into the batches it came from. */
	@Transactional(propagation = org.springframework.transaction.annotation.Propagation.MANDATORY)
	public void release(long orderId, Long actorId) {
		var rows = db.sql("""
				select a.batch_id, sum(a.qty)::int from allocations a join order_items i on i.id = a.order_item_id
				where i.order_id = ? group by a.batch_id order by a.batch_id""")
			.param(orderId).query((rs, n) -> new long[] { rs.getLong(1), rs.getInt(2) }).list();
		for (var r : rows) {
			db.sql("update batches set qty_available = qty_available + ? where id = ?").params(r[1], r[0]).update();
			db.sql("insert into stock_movements (batch_id, delta, reason, order_id, actor_id) values (?, ?, 'RELEASED', ?, ?)").params(r[0], r[1], orderId, actorId).update();
		}
	}

	public List<StockRow> overview() {
		var today = LocalDate.now(clock);
		return db.sql("""
				select p.id, p.name, p.drug_class, p.image,
				  coalesce(sum(b.qty_available), 0)::int,
				  coalesce(sum(b.qty_available) filter (where b.expiry_date >= :sellableFrom), 0)::int,
				  coalesce(sum(b.qty_available) filter (where b.expiry_date < :today), 0)::int,
				  min(b.expiry_date) filter (where b.qty_available > 0 and b.expiry_date >= :today)
				from products p left join batches b on b.product_id = p.id
				group by p.id order by p.name""")
			.param("sellableFrom", catalog.sellableFrom()).param("today", today)
			.query((rs, n) -> new StockRow(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getInt(5), rs.getInt(6), rs.getInt(7),
				rs.getObject(8, LocalDate.class), rs.getInt(6) < LOW_STOCK)).list();
	}

	public List<Batch> batches(long productId) {
		var today = LocalDate.now(clock);
		var sellable = catalog.sellableFrom();
		return db.sql("select id, product_id, batch_no, expiry_date, qty_received, qty_available from batches where product_id = ? order by expiry_date, id")
			.param(productId).query((rs, n) -> {
				var exp = rs.getObject(4, LocalDate.class);
				String status = exp.isBefore(today) ? "EXPIRED" : exp.isBefore(sellable) ? "NOT_FOR_SALE" : "SELLABLE";
				return new Batch(rs.getLong(1), rs.getLong(2), rs.getString(3), exp, rs.getInt(5), rs.getInt(6), status);
			}).list();
	}

	public List<ExpiringRow> expiring(int days) {
		var today = LocalDate.now(clock);
		return db.sql("""
				select b.id, p.id, p.name, b.batch_no, b.expiry_date, b.qty_available from batches b join products p on p.id = b.product_id
				where b.qty_available > 0 and b.expiry_date <= ? order by b.expiry_date, p.name""")
			.param(today.plusDays(days))
			.query((rs, n) -> {
				var exp = rs.getObject(5, LocalDate.class);
				return new ExpiringRow(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4), exp, rs.getInt(6), java.time.temporal.ChronoUnit.DAYS.between(today, exp));
			}).list();
	}

	@Transactional
	public Batch receive(long productId, String batchNo, LocalDate expiry, int qty, long actorId) {
		var today = LocalDate.now(clock);
		if (!expiry.isAfter(today)) {
			throw ApiException.invalid("Some fields need fixing.", Map.of("expiryDate", "must be in the future"));
		}
		long id;
		try {
			id = db.sql("insert into batches (product_id, batch_no, expiry_date, qty_received, qty_available, received_at, received_by) values (?, ?, ?, ?, ?, ?, ?) returning id")
				.params(productId, batchNo.trim().toUpperCase(), expiry, qty, qty, java.sql.Timestamp.from(clock.instant()), actorId).query(Long.class).single();
		} catch (DuplicateKeyException e) {
			throw ApiException.conflict("duplicate_batch", "This product already has batch " + batchNo.trim().toUpperCase() + ".");
		} catch (org.springframework.dao.DataIntegrityViolationException e) {
			throw ApiException.notFound();
		}
		db.sql("insert into stock_movements (batch_id, delta, reason, actor_id) values (?, ?, 'RECEIVED', ?)").params(id, qty, actorId).update();
		return batches(productId).stream().filter(b -> b.id() == id).findFirst().orElseThrow();
	}

	/** Removes the remaining units of an expired batch from stock. */
	@Transactional
	public Batch writeOff(long batchId, long actorId) {
		var row = db.sql("select product_id, expiry_date, qty_available from batches where id = ? for update").param(batchId)
			.query((rs, n) -> new Object[] { rs.getLong(1), rs.getObject(2, LocalDate.class), rs.getInt(3) }).optional().orElseThrow(ApiException::notFound);
		long productId = (long) row[0];
		if (!((LocalDate) row[1]).isBefore(LocalDate.now(clock))) {
			throw ApiException.conflict("not_expired", "Only expired batches can be written off.");
		}
		int qty = (int) row[2];
		if (qty == 0) throw ApiException.conflict("nothing_to_write_off", "This batch has no stock left.");
		db.sql("update batches set qty_available = 0 where id = ?").param(batchId).update();
		db.sql("insert into stock_movements (batch_id, delta, reason, actor_id) values (?, ?, 'WRITTEN_OFF', ?)").params(batchId, -qty, actorId).update();
		return batches(productId).stream().filter(b -> b.id() == batchId).findFirst().orElseThrow();
	}

}
