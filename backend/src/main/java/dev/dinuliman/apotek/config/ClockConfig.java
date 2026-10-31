package dev.dinuliman.apotek.config;

import java.time.Clock;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class ClockConfig {

	/** The pharmacy works in Jakarta time; "today" and expiry dates follow it. Tests replace this bean. */
	public static final ZoneId JAKARTA = ZoneId.of("Asia/Jakarta");

	@Bean
	Clock clock() {
		return Clock.system(JAKARTA);
	}

}
