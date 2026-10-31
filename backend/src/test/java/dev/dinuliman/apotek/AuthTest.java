package dev.dinuliman.apotek;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class AuthTest extends ApiTest {

	@Test
	void writesWithoutTheCsrfTokenAreRefused() throws Exception {
		mvc.perform(MockMvcRequestBuilders.post("/api/auth/login").contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"a@b.c\",\"password\":\"x\"}"))
			.andExpect(status().isForbidden());
	}

	@Test
	void registrationIsValidated() throws Exception {
		mvc.perform(post("/api/auth/register", null, "{\"email\":\"not-an-email\",\"password\":\"short\",\"name\":\"\",\"phone\":\"12345\"}"))
			.andExpect(status().isUnprocessableContent())
			.andExpect(jsonPath("$.errors.email").exists()).andExpect(jsonPath("$.errors.password").exists())
			.andExpect(jsonPath("$.errors.name").exists()).andExpect(jsonPath("$.errors.phone").exists());
		var u = customer();
		mvc.perform(post("/api/auth/register", null, "{\"email\":\"" + u.email().toUpperCase() + "\",\"password\":\"password123\",\"name\":\"Dup\"}"))
			.andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.errors.email").value("is already registered"));
	}

	@Test
	void repeatedWrongPasswordsAreThrottled() throws Exception {
		var u = customer();
		for (int i = 0; i < 5; i++) {
			mvc.perform(post("/api/auth/login", null, "{\"email\":\"" + u.email() + "\",\"password\":\"guess" + i + "\"}"))
				.andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("bad_credentials"));
		}
		mvc.perform(post("/api/auth/login", null, "{\"email\":\"" + u.email() + "\",\"password\":\"password123\"}"))
			.andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.errors.retryAfterSeconds").exists());
	}

	@Test
	void pharmacistAreaIsClosedToOthers() throws Exception {
		mvc.perform(get("/api/admin/orders", customer())).andExpect(status().isForbidden());
		mvc.perform(get("/api/admin/orders", null)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/orders", null)).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/admin/orders", pharmacist())).andExpect(status().isOk());
	}

}
