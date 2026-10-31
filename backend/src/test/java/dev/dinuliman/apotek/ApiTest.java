package dev.dinuliman.apotek;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import dev.dinuliman.apotek.auth.CurrentUser;
import dev.dinuliman.apotek.auth.Users;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** Real PostgreSQL in a container, rebuilt from the migrations before every test. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
public abstract class ApiTest {

	@Autowired protected MockMvc mvc;
	@Autowired protected JdbcClient db;
	@Autowired protected MutableClock clock;
	@Autowired protected Users users;
	@Autowired protected PasswordEncoder encoder;
	@Autowired private Flyway flyway;

	private static final AtomicInteger seq = new AtomicInteger();

	@BeforeEach
	void resetDatabase() {
		clock.reset();
		flyway.clean();
		flyway.migrate();
	}

	protected CurrentUser customer() { return account("CUSTOMER"); }
	protected CurrentUser pharmacist() { return account("PHARMACIST"); }

	private CurrentUser account(String role) {
		String email = role.toLowerCase() + seq.incrementAndGet() + "@test.example";
		long id = users.create(email, encoder.encode("password123"), "Test " + role, "", role);
		return new CurrentUser(id, email, "Test " + role, role, "");
	}

	protected long productId(String slug) {
		return db.sql("select id from products where slug = ?").param(slug).query(Long.class).single();
	}

	protected int batchQty(String batchNo) {
		return db.sql("select qty_available from batches where batch_no = ?").param(batchNo).query(Integer.class).single();
	}

	protected MockHttpServletRequestBuilder get(String path, CurrentUser as) {
		var r = MockMvcRequestBuilders.get(path);
		return as == null ? r : r.with(user(as));
	}

	protected MockHttpServletRequestBuilder post(String path, CurrentUser as, String json) {
		var r = MockMvcRequestBuilders.post(path).with(csrf()).contentType(MediaType.APPLICATION_JSON).content(json == null ? "{}" : json);
		return as == null ? r : r.with(user(as));
	}

	protected static String address() {
		return "\"recipient\":\"Sari\",\"phone\":\"081234567890\",\"address\":\"Jl. Kenanga No. 12, Tebet\",\"city\":\"Jakarta\",\"postalCode\":\"12810\"";
	}

	protected String orderJson(String items, Long prescriptionId) {
		return "{\"items\":[" + items + "]," + address() + (prescriptionId == null ? "" : ",\"prescriptionId\":" + prescriptionId) + "}";
	}

	protected String line(String slug, int qty) {
		return "{\"productId\":" + productId(slug) + ",\"qty\":" + qty + "}";
	}

	protected MockHttpServletRequestBuilder placeOrder(CurrentUser as, String json) {
		return post("/api/orders", as, json).header("Idempotency-Key", UUID.randomUUID().toString());
	}

}
