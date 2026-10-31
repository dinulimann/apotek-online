package dev.dinuliman.apotek;

import org.springframework.boot.SpringApplication;

/** Runs the app against a throwaway PostgreSQL container, with demo data: mvn spring-boot:test-run */
public class TestApotekApplication {

	public static void main(String[] args) {
		SpringApplication.from(ApotekApplication::main).with(TestcontainersConfiguration.class).withAdditionalProfiles("demo").run(args);
	}

}
