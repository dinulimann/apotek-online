package dev.dinuliman.apotek.web;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

@RestControllerAdvice
@org.springframework.core.annotation.Order(org.springframework.core.Ordered.HIGHEST_PRECEDENCE)
public class ErrorHandler {

	private static final Logger log = LoggerFactory.getLogger(ErrorHandler.class);

	static ProblemDetail problem(HttpStatus status, String code, String message, Map<String, ?> details) {
		var p = ProblemDetail.forStatusAndDetail(status, message);
		p.setProperty("code", code);
		if (!details.isEmpty()) p.setProperty("errors", details);
		return p;
	}

	@ExceptionHandler
	ProblemDetail api(ApiException e) {
		return problem(e.status(), e.code(), e.getMessage(), e.details());
	}

	@ExceptionHandler
	ProblemDetail validation(MethodArgumentNotValidException e) {
		Map<String, String> errors = new LinkedHashMap<>();
		e.getBindingResult().getFieldErrors().forEach(f -> errors.putIfAbsent(f.getField(), f.getDefaultMessage()));
		return problem(HttpStatus.UNPROCESSABLE_CONTENT, "invalid", "Some fields need fixing.", errors);
	}

	@ExceptionHandler
	ProblemDetail unreadable(HttpMessageNotReadableException e) {
		return problem(HttpStatus.BAD_REQUEST, "bad_request", "The request body is not valid JSON for this endpoint.", Map.of());
	}

	@ExceptionHandler
	ProblemDetail header(MissingRequestHeaderException e) {
		return problem(HttpStatus.BAD_REQUEST, "missing_header", "Missing header " + e.getHeaderName() + ".", Map.of());
	}

	@ExceptionHandler
	ProblemDetail tooLarge(MaxUploadSizeExceededException e) {
		return problem(HttpStatus.CONTENT_TOO_LARGE, "file_too_large", "Files can be at most 5 MB.", Map.of());
	}

	@ExceptionHandler
	ProblemDetail unexpected(RuntimeException e) {
		if (e instanceof org.springframework.security.access.AccessDeniedException ade) throw ade;
		log.error("Unhandled error", e);
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal", "Something went wrong.", Map.of());
	}

}
