package dev.dinuliman.apotek.demo;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

import dev.dinuliman.apotek.auth.Users;
import dev.dinuliman.apotek.orders.Orders;
import dev.dinuliman.apotek.prescriptions.Prescriptions;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/** Demo accounts and a few orders in different states. Runs with the "demo" profile on an empty database. */
@Component
@Profile("demo")
class DemoData implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(DemoData.class);

	private final Users users;
	private final PasswordEncoder encoder;
	private final Orders orders;
	private final Prescriptions prescriptions;
	private final JdbcClient db;

	DemoData(Users users, PasswordEncoder encoder, Orders orders, Prescriptions prescriptions, JdbcClient db) {
		this.users = users;
		this.encoder = encoder;
		this.orders = orders;
		this.prescriptions = prescriptions;
		this.db = db;
	}

	private long product(String slug) {
		return db.sql("select id from products where slug = ?").param(slug).query(Long.class).single();
	}

	private Orders.Place to(String name, List<Orders.Line> lines, Long rx) {
		return new Orders.Place(lines, name, "081234567890", "Jl. Kenanga No. 12, RT 03/RW 05, Tebet", "Jakarta Selatan", "12810", rx);
	}

	@Override
	public void run(ApplicationArguments args) throws IOException {
		if (users.byEmail("sari@example.com").isPresent()) return;
		long sari = users.create("sari@example.com", encoder.encode("demo1234"), "Sari Wulandari", "081234567890", "CUSTOMER");
		long budi = users.create("budi@example.com", encoder.encode("demo1234"), "Budi Santoso", "081298765432", "CUSTOMER");
		long apt = users.create("apoteker@teduh.example", encoder.encode("apoteker123"), "apt. Rina Kusuma, S.Farm.", "", "PHARMACIST");

		var scan = new ClassPathResource("demo/sample-prescription.png").getContentAsByteArray();
		var rx = prescriptions.store(sari, scan, "dr. Nama Contoh");
		orders.place(sari, UUID.randomUUID(), to("Sari Wulandari", List.of(new Orders.Line(product("amoxicillin-500"), 1), new Orders.Line(product("paracetamol-500"), 1)), rx.id()));

		var paid = orders.place(budi, UUID.randomUUID(), to("Budi Santoso", List.of(new Orders.Line(product("vitamin-c-1000"), 2), new Orders.Line(product("medical-masks"), 1)), null));
		orders.pay(paid.number(), budi);

		var done = orders.place(sari, UUID.randomUUID(), to("Sari Wulandari", List.of(new Orders.Line(product("digital-thermometer"), 1), new Orders.Line(product("plaster-strips"), 2)), null));
		orders.pay(done.number(), sari);
		orders.ship(done.number(), apt, "JNE-8812345670");
		orders.deliver(done.number(), apt);

		orders.place(budi, UUID.randomUUID(), to("Budi Santoso", List.of(new Orders.Line(product("cetirizine-10"), 1)), null));
		log.info("Demo data: sari@example.com / demo1234, apoteker@teduh.example / apoteker123");
	}

}
