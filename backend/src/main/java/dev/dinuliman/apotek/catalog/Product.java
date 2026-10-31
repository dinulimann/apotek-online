package dev.dinuliman.apotek.catalog;

import com.fasterxml.jackson.annotation.JsonProperty;

public record Product(long id, String slug, String name, String genericName, String form, String strength, String pack,
		String categorySlug, String categoryName, String drugClass, long price, Integer maxPerOrder, String image,
		String description, String dosage, String warnings, boolean active, int available) {

	@JsonProperty("needsPrescription")
	public boolean needsPrescription() { return "KERAS".equals(drugClass); }

}
