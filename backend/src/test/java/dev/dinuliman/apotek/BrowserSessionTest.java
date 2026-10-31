package dev.dinuliman.apotek;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.CookieManager;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * Sign-up, sign-in and sign-out over real HTTP with a cookie jar, the way the browser does it:
 * fetch the XSRF-TOKEN cookie, echo it in the X-XSRF-TOKEN header, keep the session cookie.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestcontainersConfiguration.class)
class BrowserSessionTest {

	@LocalServerPort int port;
	@Autowired Flyway flyway;

	private CookieManager jar;
	private HttpClient http;

	@BeforeEach
	void setUp() {
		flyway.clean();
		flyway.migrate();
		jar = new CookieManager();
		http = HttpClient.newBuilder().cookieHandler(jar).build();
	}

	private String xsrf() {
		return jar.getCookieStore().getCookies().stream().filter(c -> c.getName().equals("XSRF-TOKEN")).findFirst().map(c -> c.getValue()).orElse("");
	}

	private HttpResponse<String> send(String method, String path, String json) throws Exception {
		var b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path)).header("Content-Type", "application/json");
		if (!method.equals("GET")) b.header("X-XSRF-TOKEN", xsrf());
		b.method(method, json == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json));
		return http.send(b.build(), HttpResponse.BodyHandlers.ofString());
	}

	@Test
	void signUpSignOutSignIn() throws Exception {
		assertThat(send("GET", "/api/auth/csrf", null).statusCode()).isEqualTo(200);
		assertThat(xsrf()).isNotEmpty();

		var reg = send("POST", "/api/auth/register", "{\"email\":\"Nina@Example.com\",\"password\":\"rahasia-123\",\"name\":\"Nina\",\"phone\":\"081311112222\"}");
		assertThat(reg.statusCode()).isEqualTo(201);
		assertThat(reg.body()).contains("\"email\":\"nina@example.com\"");
		assertThat(reg.headers().allValues("set-cookie")).anyMatch(c -> c.startsWith("JSESSIONID=") && c.contains("HttpOnly") && c.contains("SameSite=Lax"));
		assertThat(send("GET", "/api/auth/me", null).body()).contains("\"name\":\"Nina\"");

		send("GET", "/api/auth/csrf", null); // the token is rotated at sign-in
		assertThat(send("POST", "/api/auth/logout", null).statusCode()).isEqualTo(204);
		assertThat(send("GET", "/api/auth/me", null).statusCode()).isEqualTo(401);

		send("GET", "/api/auth/csrf", null);
		assertThat(send("POST", "/api/auth/login", "{\"email\":\"nina@example.com\",\"password\":\"rahasia-123\"}").statusCode()).isEqualTo(200);
		assertThat(send("GET", "/api/orders", null).statusCode()).isEqualTo(200);
	}

	@Test
	void aWriteWithoutTheTokenIsRefused() throws Exception {
		send("GET", "/api/auth/csrf", null);
		var res = http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/login")).header("Content-Type", "application/json")
			.POST(HttpRequest.BodyPublishers.ofString("{\"email\":\"a@b.co\",\"password\":\"x\"}")).build(), HttpResponse.BodyHandlers.ofString());
		assertThat(res.statusCode()).isEqualTo(403);
	}

	@Test
	void securityHeadersAreSet() throws Exception {
		var res = send("GET", "/api/products?size=1", null);
		assertThat(res.headers().firstValue("x-content-type-options")).contains("nosniff");
		assertThat(res.headers().firstValue("x-frame-options")).contains("DENY");
		assertThat(res.headers().firstValue("content-security-policy").orElse("")).contains("frame-ancestors 'none'");
	}

}
