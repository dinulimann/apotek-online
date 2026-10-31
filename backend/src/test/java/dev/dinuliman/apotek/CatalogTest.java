package dev.dinuliman.apotek;

import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;

class CatalogTest extends ApiTest {

	@Test
	void stockShownIsOnlyWhatCanBeSold() throws Exception {
		// Ibuprofen: 40 units expire in 20 days (inside the 30-day minimum shelf life), 60 are fine.
		mvc.perform(get("/api/products/ibuprofen-400", null)).andExpect(status().isOk())
			.andExpect(jsonPath("$.available").value(60)).andExpect(jsonPath("$.drugClass").value("BEBAS_TERBATAS")).andExpect(jsonPath("$.maxPerOrder").value(3));
		// Cetirizine: 15 units already expired, 50 fine.
		mvc.perform(get("/api/products/cetirizine-10", null)).andExpect(jsonPath("$.available").value(50));
	}

	@Test
	void searchFiltersSortsAndPages() throws Exception {
		mvc.perform(get("/api/products?q=vitamin", null)).andExpect(jsonPath("$.total").value(3));
		mvc.perform(get("/api/products?q=AMOXI", null)).andExpect(jsonPath("$.items[0].slug").value("amoxicillin-500"));
		mvc.perform(get("/api/products?drugClass=KERAS", null)).andExpect(jsonPath("$.total").value(5))
			.andExpect(jsonPath("$.items[*].needsPrescription", hasSize(5)))
			.andExpect(jsonPath("$.items[*].needsPrescription", everyItem(is(true))));
		mvc.perform(get("/api/products/paracetamol-500", null)).andExpect(jsonPath("$.needsPrescription").value(false));
		mvc.perform(get("/api/products?sort=PRICE_DESC&size=1", null)).andExpect(jsonPath("$.items[0].slug").value("blood-pressure-aneroid"));
		mvc.perform(get("/api/products?category=herbal", null)).andExpect(jsonPath("$.total").value(3));
		mvc.perform(get("/api/products?size=5&page=1", null)).andExpect(jsonPath("$.items", hasSize(5))).andExpect(jsonPath("$.total").value(27));
		// A search for "%" is a literal percent sign, not a wildcard.
		mvc.perform(get("/api/products?q=%25", null)).andExpect(jsonPath("$.total").value(0));
	}

	@Test
	void badInputIsRejected() throws Exception {
		mvc.perform(get("/api/products?drugClass=NARKOTIKA", null)).andExpect(status().isUnprocessableContent()).andExpect(jsonPath("$.code").value("invalid"));
		mvc.perform(get("/api/products/does-not-exist", null)).andExpect(status().isNotFound());
		mvc.perform(get("/api/categories", null)).andExpect(jsonPath("$", hasSize(7)));
	}

}
