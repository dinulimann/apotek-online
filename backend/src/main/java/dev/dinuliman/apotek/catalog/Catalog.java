package dev.dinuliman.apotek.catalog;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import dev.dinuliman.apotek.config.AppProperties;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class Catalog {

	public record Category(String slug, String name, int products) {
	}

	public record Page(List<Product> items, int page, int size, long total) {
	}

	public enum Sort { NAME, PRICE_ASC, PRICE_DESC }

	private static final String COLUMNS = """
		p.id, p.slug, p.name, p.generic_name, p.form, p.strength, p.pack, c.slug, c.name, p.drug_class, p.price, p.max_per_order,
		p.image, p.description, p.dosage, p.warnings, p.active,
		coalesce((select sum(b.qty_available) from batches b where b.product_id = p.id and b.expiry_date >= :sellableFrom), 0)::int as available
		""";

	private final JdbcClient db;
	private final Clock clock;
	private final AppProperties props;

	Catalog(JdbcClient db, Clock clock, AppProperties props) {
		this.db = db;
		this.clock = clock;
		this.props = props;
	}

	/** Batches expiring before this date are not sold: a customer must get at least the minimum shelf life. */
	public LocalDate sellableFrom() {
		return LocalDate.now(clock).plusDays(props.minShelfLifeDays());
	}

	static Product map(ResultSet rs, int n) throws SQLException {
		return new Product(rs.getLong(1), rs.getString(2), rs.getString(3), rs.getString(4), rs.getString(5), rs.getString(6), rs.getString(7),
			rs.getString(8), rs.getString(9), rs.getString(10), rs.getLong(11), (Integer) rs.getObject(12), rs.getString(13),
			rs.getString(14), rs.getString(15), rs.getString(16), rs.getBoolean(17), rs.getInt(18));
	}

	public List<Category> categories() {
		return db.sql("select c.slug, c.name, count(p.id) from categories c left join products p on p.category_id = c.id and p.active group by c.id order by c.position")
			.query((rs, n) -> new Category(rs.getString(1), rs.getString(2), rs.getInt(3))).list();
	}

	public Page search(String q, String category, String drugClass, boolean inStockOnly, Sort sort, int page, int size) {
		var where = new ArrayList<String>(List.of("p.active"));
		Map<String, Object> params = new HashMap<>();
		params.put("sellableFrom", sellableFrom());
		if (q != null && !q.isBlank()) {
			where.add("(p.name ilike :q or p.generic_name ilike :q)");
			params.put("q", "%" + q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%");
		}
		if (category != null && !category.isBlank()) {
			where.add("c.slug = :category");
			params.put("category", category);
		}
		if (drugClass != null && !drugClass.isBlank()) {
			where.add("p.drug_class = :drugClass");
			params.put("drugClass", drugClass);
		}
		String from = " from products p join categories c on c.id = p.category_id where " + String.join(" and ", where);
		String select = "select * from (select " + COLUMNS + from + ") x" + (inStockOnly ? " where x.available > 0" : "");
		String order = switch (sort) {
			case PRICE_ASC -> " order by 11, 3";
			case PRICE_DESC -> " order by 11 desc, 3";
			case NAME -> " order by 3";
		};
		long total = db.sql("select count(*) from (" + select + ") t").params(params).query(Long.class).single();
		params.put("limit", size);
		params.put("offset", page * size);
		var items = db.sql(select + order + " limit :limit offset :offset").params(params).query(Catalog::map).list();
		return new Page(items, page, size, total);
	}

	public Optional<Product> bySlug(String slug) {
		return db.sql("select " + COLUMNS + " from products p join categories c on c.id = p.category_id where p.slug = :slug")
			.param("sellableFrom", sellableFrom()).param("slug", slug).query(Catalog::map).optional();
	}

	public Map<Long, Product> byIds(Collection<Long> ids) {
		var out = new HashMap<Long, Product>();
		if (ids.isEmpty()) return out;
		db.sql("select " + COLUMNS + " from products p join categories c on c.id = p.category_id where p.id in (:ids)")
			.param("sellableFrom", sellableFrom()).param("ids", ids).query(Catalog::map).list()
			.forEach(p -> out.put(p.id(), p));
		return out;
	}

}
