package dev.dinuliman.apotek.inventory;

import java.time.LocalDate;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import dev.dinuliman.apotek.auth.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
class InventoryController {

	record Receive(@NotBlank @Pattern(regexp = "^[A-Za-z0-9-]{2,20}$", message = "2 to 20 letters, digits or dashes") String batchNo,
			@NotNull LocalDate expiryDate, @Min(1) @Max(100_000) int qty) {
	}

	private final Inventory inventory;

	InventoryController(Inventory inventory) { this.inventory = inventory; }

	@GetMapping("/inventory")
	List<Inventory.StockRow> overview() { return inventory.overview(); }

	@GetMapping("/inventory/{productId}/batches")
	List<Inventory.Batch> batches(@PathVariable long productId) { return inventory.batches(productId); }

	@PostMapping("/inventory/{productId}/batches")
	@ResponseStatus(HttpStatus.CREATED)
	Inventory.Batch receive(@PathVariable long productId, @Valid @RequestBody Receive in, @AuthenticationPrincipal CurrentUser user) {
		return inventory.receive(productId, in.batchNo(), in.expiryDate(), in.qty(), user.id());
	}

	@GetMapping("/inventory/expiring")
	List<Inventory.ExpiringRow> expiring(@RequestParam(defaultValue = "90") int days) {
		return inventory.expiring(Math.min(365, Math.max(0, days)));
	}

	@PostMapping("/batches/{id}/write-off")
	Inventory.Batch writeOff(@PathVariable long id, @AuthenticationPrincipal CurrentUser user) {
		return inventory.writeOff(id, user.id());
	}

}
