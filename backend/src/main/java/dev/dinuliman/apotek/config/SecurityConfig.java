package dev.dinuliman.apotek.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;

/**
 * Session cookie auth for a same-origin SPA. CSRF uses the double-submit cookie
 * (XSRF-TOKEN, read by the app and sent back as X-XSRF-TOKEN on every write).
 */
@Configuration
public class SecurityConfig {

	@Bean
	SecurityFilterChain api(HttpSecurity http) throws Exception {
		http.authorizeHttpRequests(a -> a
				.requestMatchers(HttpMethod.GET, "/api/categories", "/api/products", "/api/products/*").permitAll()
				.requestMatchers("/api/auth/register", "/api/auth/login", "/api/auth/csrf").permitAll()
				.requestMatchers("/api/admin/**").hasRole("PHARMACIST")
				.requestMatchers("/api/**").authenticated()
				.anyRequest().permitAll())
			.csrf(c -> c.spa())
			.exceptionHandling(e -> e.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			.formLogin(f -> f.disable())
			.httpBasic(b -> b.disable())
			.securityContext(s -> s.securityContextRepository(securityContextRepository()))
			.logout(l -> l.logoutUrl("/api/auth/logout").logoutSuccessHandler((req, res, auth) -> res.setStatus(204)))
			.headers(h -> h.contentSecurityPolicy(csp -> csp.policyDirectives(
				"default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; frame-ancestors 'none'")));
		return http.build();
	}

	@Bean
	SecurityContextRepository securityContextRepository() {
		return new HttpSessionSecurityContextRepository();
	}

	@Bean
	PasswordEncoder passwordEncoder() {
		return PasswordEncoderFactories.createDelegatingPasswordEncoder();
	}

	@Bean
	AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder encoder) {
		var provider = new DaoAuthenticationProvider(users);
		provider.setPasswordEncoder(encoder);
		return new ProviderManager(provider);
	}

}
