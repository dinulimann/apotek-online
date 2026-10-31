package dev.dinuliman.apotek.orders;

import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import dev.dinuliman.apotek.auth.CurrentUser;
import dev.dinuliman.apotek.web.ApiException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/orders")
class OrderController {

	record LineIn(@NotNull Long productId, @Min(1) int qty) {
	}

	record PlaceIn(@NotEmpty @Size(max = 30) List<@Valid LineIn> items,
			@NotBlank @Size(max = 80) String recipient,
			@NotBlank @Pattern(regexp = "^(\\+62|0)8[0-9]{7,12}$", message = "must be an Indonesian mobile number, e.g. 0812...") String phone,
			@NotBlank @Size(min = 10, max = 250, message = "must be 10 to 250 characters") String address,
			@NotBlank @Size(max = 60) String city,
			@NotBlank @Pattern(regexp = "^[0-9]{5}$", message = "must be 5 digits") String postalCode,
			Long prescriptionId) {
	}

	private final Orders orders;

	OrderController(Orders orders) { this.orders = orders; }

	/**
	 * Places an order. The Idempotency-Key header makes retries safe: the same key returns the
	 * order it already created instead of taking stock twice.
	 */
	@PostMapping
	ResponseEntity<OrderView> place(@RequestHeader("Idempotency-Key") String keyHeader, @Valid @RequestBody PlaceIn in, @AuthenticationPrincipal CurrentUser user) {
		UUID key;
		try { key = UUID.fromString(keyHeader); }
		catch (IllegalArgumentException e) { throw ApiException.invalid("Idempotency-Key must be a UUID.", java.util.Map.of()); }
		var existing = orders.replay(key, user.id());
		if (existing.isPresent()) return ResponseEntity.ok().header("Idempotent-Replayed", "true").body(existing.get());
		var place = new Orders.Place(in.items().stream().map(l -> new Orders.Line(l.productId(), l.qty())).toList(),
			in.recipient(), in.phone(), in.address(), in.city(), in.postalCode(), in.prescriptionId());
		try {
			return ResponseEntity.status(201).body(orders.place(user.id(), key, place));
		} catch (DuplicateKeyException e) {
			// The same checkout arrived twice at once; the other request created the order.
			return orders.replay(key, user.id()).map(o -> ResponseEntity.ok().header("Idempotent-Replayed", "true").body(o)).orElseThrow(() -> e);
		}
	}

	@GetMapping
	List<OrderView> mine(@AuthenticationPrincipal CurrentUser user) { return orders.mine(user.id()); }

	@GetMapping("/{number}")
	OrderView one(@PathVariable String number, @AuthenticationPrincipal CurrentUser user) { return orders.mine(number, user.id()); }

	@PostMapping("/{number}/pay")
	OrderView pay(@PathVariable String number, @AuthenticationPrincipal CurrentUser user) { return orders.pay(number, user.id()); }

	@PostMapping("/{number}/cancel")
	OrderView cancel(@PathVariable String number, @AuthenticationPrincipal CurrentUser user) { return orders.cancel(number, user.id()); }

}
