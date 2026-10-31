package dev.dinuliman.apotek.catalog;

import java.util.List;
import java.util.Set;

import dev.dinuliman.apotek.web.ApiException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class CatalogController {

	private static final Set<String> CLASSES = Set.of("BEBAS", "BEBAS_TERBATAS", "KERAS", "ALKES");

	private final Catalog catalog;

	CatalogController(Catalog catalog) { this.catalog = catalog; }

	@GetMapping("/categories")
	List<Catalog.Category> categories() {
		return catalog.categories();
	}

	@GetMapping("/products")
	Catalog.Page products(@RequestParam(required = false) String q, @RequestParam(required = false) String category,
			@RequestParam(required = false) String drugClass, @RequestParam(defaultValue = "false") boolean inStock,
			@RequestParam(defaultValue = "NAME") String sort, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "24") int size) {
		if (drugClass != null && !drugClass.isBlank() && !CLASSES.contains(drugClass)) {
			throw ApiException.invalid("Unknown drug class.", java.util.Map.of("drugClass", "must be one of " + CLASSES));
		}
		Catalog.Sort s;
		try { s = Catalog.Sort.valueOf(sort.toUpperCase()); }
		catch (IllegalArgumentException e) { throw ApiException.invalid("Unknown sort.", java.util.Map.of("sort", "NAME, PRICE_ASC or PRICE_DESC")); }
		return catalog.search(q, category, drugClass, inStock, s, Math.max(0, page), Math.min(48, Math.max(1, size)));
	}

	@GetMapping("/products/{slug}")
	Product product(@PathVariable String slug) {
		return catalog.bySlug(slug).filter(Product::active).orElseThrow(ApiException::notFound);
	}

}
