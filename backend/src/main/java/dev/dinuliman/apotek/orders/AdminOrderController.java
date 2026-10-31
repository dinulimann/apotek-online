package dev.dinuliman.apotek.orders;

import java.util.List;
import java.util.Map;
import java.util.Set;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import dev.dinuliman.apotek.auth.CurrentUser;
import dev.dinuliman.apotek.web.ApiException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin/orders")
class AdminOrderController {

	record ReviewIn(@NotNull Boolean approve, @Size(max = 500) String note) {
	}

	record ShipIn(@Pattern(regexp = "^[A-Za-z0-9-]{6,30}$", message = "6 to 30 letters, digits or dashes") String trackingNo) {
	}

	private static final Set<String> STATUSES = Set.of("AWAITING_REVIEW", "AWAITING_PAYMENT", "PAID", "SHIPPED", "DELIVERED", "REJECTED", "CANCELLED");

	private final Orders orders;

	AdminOrderController(Orders orders) { this.orders = orders; }

	@GetMapping
	List<OrderView> list(@RequestParam(defaultValue = "") String status) {
		if (!status.isEmpty() && !STATUSES.contains(status)) throw ApiException.invalid("Unknown status.", Map.of("status", "unknown"));
		return orders.byStatus(status);
	}

	@GetMapping("/counts")
	Map<String, Long> counts() { return orders.counts(); }

	@GetMapping("/{number}")
	OrderView one(@PathVariable String number) { return orders.byNumber(number); }

	@PostMapping("/{number}/review")
	OrderView review(@PathVariable String number, @Valid @RequestBody ReviewIn in, @AuthenticationPrincipal CurrentUser user) {
		return orders.review(number, user.id(), in.approve(), in.note());
	}

	@PostMapping("/{number}/ship")
	OrderView ship(@PathVariable String number, @Valid @RequestBody ShipIn in, @AuthenticationPrincipal CurrentUser user) {
		if (in.trackingNo() == null) throw ApiException.invalid("Some fields need fixing.", Map.of("trackingNo", "required"));
		return orders.ship(number, user.id(), in.trackingNo());
	}

	@PostMapping("/{number}/deliver")
	OrderView deliver(@PathVariable String number, @AuthenticationPrincipal CurrentUser user) {
		return orders.deliver(number, user.id());
	}

}
