package dev.dinuliman.apotek.demo;

import org.springframework.boot.flyway.autoconfigure.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

/** For end-to-end tests only: rebuild the schema from the migrations on every start. */
@Configuration
@Profile("e2e")
class FreshDatabase {

	@Bean
	FlywayMigrationStrategy cleanThenMigrate() {
		return flyway -> {
			flyway.clean();
			flyway.migrate();
		};
	}

}
