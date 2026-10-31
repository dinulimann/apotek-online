package dev.dinuliman.apotek.auth;

import java.util.Map;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import dev.dinuliman.apotek.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
class AuthController {

	record Register(@NotBlank @Email @Size(max = 120) String email,
			@NotBlank @Size(min = 8, max = 72, message = "must be 8 to 72 characters") String password,
			@NotBlank @Size(max = 80) String name,
			@Pattern(regexp = "^(\\+62|0)8[0-9]{7,12}$", message = "must be an Indonesian mobile number, e.g. 0812...") String phone) {
	}

	record Login(@NotBlank String email, @NotBlank String password) {
	}

	record Me(long id, String email, String name, String role) {
		static Me of(CurrentUser u) { return new Me(u.id(), u.email(), u.name(), u.role()); }
	}

	private final Users users;
	private final PasswordEncoder encoder;
	private final AuthenticationManager auth;
	private final SecurityContextRepository contexts;
	private final LoginThrottle throttle;

	AuthController(Users users, PasswordEncoder encoder, AuthenticationManager auth, SecurityContextRepository contexts, LoginThrottle throttle) {
		this.users = users;
		this.encoder = encoder;
		this.auth = auth;
		this.contexts = contexts;
		this.throttle = throttle;
	}

	/** Gives the SPA its XSRF-TOKEN cookie before the first write. */
	@GetMapping("/csrf")
	Map<String, String> csrf(CsrfToken token) {
		// The token is created lazily; reading it is what makes Spring Security send the cookie.
		token.getToken();
		return Map.of("headerName", token.getHeaderName());
	}

	@PostMapping("/register")
	@ResponseStatus(HttpStatus.CREATED)
	Me register(@Valid @RequestBody Register in, HttpServletRequest req, HttpServletResponse res) {
		try {
			users.create(in.email().trim(), encoder.encode(in.password()), in.name().trim(), in.phone() == null ? "" : in.phone(), "CUSTOMER");
		} catch (DuplicateKeyException e) {
			throw ApiException.invalid("Some fields need fixing.", Map.of("email", "is already registered"));
		}
		return signIn(in.email().trim().toLowerCase(), in.password(), req, res);
	}

	@PostMapping("/login")
	Me login(@Valid @RequestBody Login in, HttpServletRequest req, HttpServletResponse res) {
		return signIn(in.email().trim().toLowerCase(), in.password(), req, res);
	}

	@GetMapping("/me")
	Me me(@AuthenticationPrincipal CurrentUser user) {
		return Me.of(user);
	}

	private Me signIn(String email, String password, HttpServletRequest req, HttpServletResponse res) {
		long wait = throttle.retryAfter(email);
		if (wait > 0) {
			throw new ApiException(HttpStatus.TOO_MANY_REQUESTS, "too_many_attempts", "Too many failed logins. Try again later.", Map.of("retryAfterSeconds", wait));
		}
		CurrentUser user;
		try {
			user = (CurrentUser) auth.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(email, password)).getPrincipal();
		} catch (AuthenticationException e) {
			throttle.failed(email);
			throw new ApiException(HttpStatus.UNAUTHORIZED, "bad_credentials", "Wrong email or password.");
		}
		throttle.succeeded(email);
		user = user.withoutPassword();
		// New session id on login, so a session id planted before login is useless.
		if (req.getSession(false) != null) req.changeSessionId();
		var context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(user, null, user.getAuthorities()));
		SecurityContextHolder.setContext(context);
		contexts.saveContext(context, req, res);
		return Me.of(user);
	}

}
