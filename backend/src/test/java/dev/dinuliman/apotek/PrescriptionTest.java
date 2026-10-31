package dev.dinuliman.apotek;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import dev.dinuliman.apotek.auth.CurrentUser;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

class PrescriptionTest extends ApiTest {

	private static final byte[] PNG = { (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13, 'I', 'H', 'D', 'R' };

	private org.springframework.test.web.servlet.ResultActions upload(CurrentUser u, String name, String type, byte[] bytes) throws Exception {
		return mvc.perform(MockMvcRequestBuilders.multipart("/api/prescriptions").file(new MockMultipartFile("file", name, type, bytes)).param("doctorName", "dr. Contoh").with(csrf()).with(user(u)));
	}

	@Test
	void theFileTypeIsCheckedFromItsContent() throws Exception {
		var u = customer();
		upload(u, "resep.png", "image/png", PNG).andExpect(status().isCreated()).andExpect(jsonPath("$.contentType").value("image/png"));
		upload(u, "resep.pdf", "application/octet-stream", "%PDF-1.7\n...".getBytes()).andExpect(status().isCreated()).andExpect(jsonPath("$.contentType").value("application/pdf"));
		// An HTML page renamed to .jpg is refused whatever the browser claims.
		upload(u, "resep.jpg", "image/jpeg", "<html><script>alert(1)</script></html>".getBytes())
			.andExpect(status().isUnsupportedMediaType()).andExpect(jsonPath("$.code").value("unsupported_file"));
		byte[] big = new byte[5 * 1024 * 1024 + 10];
		System.arraycopy(PNG, 0, big, 0, PNG.length);
		upload(u, "big.png", "image/png", big).andExpect(status().isContentTooLarge());
	}

	@Test
	void onlyThePatientAndPharmacistsCanOpenIt() throws Exception {
		var owner = customer();
		String body = upload(owner, "resep.png", "image/png", PNG).andReturn().getResponse().getContentAsString();
		int id = JsonPath.read(body, "$.id");
		String path = "/api/prescriptions/" + id + "/file";
		mvc.perform(get(path, owner)).andExpect(status().isOk()).andExpect(content().contentType("image/png"))
			.andExpect(content().bytes(PNG)).andExpect(header().string("X-Content-Type-Options", "nosniff"))
			.andExpect(header().string("Cache-Control", org.hamcrest.Matchers.containsString("no-store")));
		mvc.perform(get(path, customer())).andExpect(status().isNotFound());
		mvc.perform(get(path, pharmacist())).andExpect(status().isOk());
		mvc.perform(get(path, null)).andExpect(status().isUnauthorized());
	}

}
