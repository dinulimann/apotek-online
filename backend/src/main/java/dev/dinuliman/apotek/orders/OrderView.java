package dev.dinuliman.apotek.orders;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record OrderView(long id, String number, String status, String customerName, String customerEmail,
		String recipient, String phone, String address, String city, String postalCode,
		long subtotal, long shippingFee, long total, Long prescriptionId, boolean needsPrescription,
		String reviewNote, String reviewedBy, Instant reviewedAt, String trackingNo,
		Instant createdAt, Instant paymentDueAt, Instant paidAt, List<Item> items, List<Event> events) {

	public record Item(long productId, String slug, String name, String drugClass, String image, long unitPrice, int qty, long lineTotal, List<Batch> batches) {
	}

	public record Batch(String batchNo, LocalDate expiryDate, int qty) {
	}

	public record Event(Instant at, String type, String note, String actor) {
	}

}
