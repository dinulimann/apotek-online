package dev.dinuliman.apotek.prescriptions;

import dev.dinuliman.apotek.auth.CurrentUser;
import dev.dinuliman.apotek.web.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/prescriptions")
class PrescriptionController {

	private final Prescriptions prescriptions;

	PrescriptionController(Prescriptions prescriptions) { this.prescriptions = prescriptions; }

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	Prescriptions.Prescription upload(@RequestParam("file") MultipartFile file, @RequestParam(value = "doctorName", required = false) String doctor,
			@AuthenticationPrincipal CurrentUser user) {
		return prescriptions.store(user.id(), file, doctor);
	}

	/** Only the patient and pharmacists can see a prescription. Anyone else gets 404, not 403, so ids reveal nothing. */
	@GetMapping("/{id}/file")
	ResponseEntity<byte[]> file(@PathVariable long id, @AuthenticationPrincipal CurrentUser user) {
		var p = prescriptions.find(id).filter(x -> x.ownerId() == user.id() || user.isPharmacist()).orElseThrow(ApiException::notFound);
		return ResponseEntity.ok()
			.contentType(MediaType.parseMediaType(p.contentType()))
			.header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename("prescription-" + id + (p.contentType().equals("application/pdf") ? ".pdf" : p.contentType().equals("image/png") ? ".png" : ".jpg")).build().toString())
			.cacheControl(CacheControl.noStore())
			.body(prescriptions.read(id));
	}

}
