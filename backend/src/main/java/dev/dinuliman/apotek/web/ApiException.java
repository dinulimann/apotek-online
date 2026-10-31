package dev.dinuliman.apotek.web;

import java.util.Map;

import org.springframework.http.HttpStatus;

/** An error the client can act on. Rendered as RFC 9457 problem details with a stable code. */
public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;
	private final Map<String, ?> details;

	public ApiException(HttpStatus status, String code, String message) {
		this(status, code, message, Map.of());
	}

	public ApiException(HttpStatus status, String code, String message, Map<String, ?> details) {
		super(message);
		this.status = status;
		this.code = code;
		this.details = details;
	}

	public HttpStatus status() { return status; }
	public String code() { return code; }
	public Map<String, ?> details() { return details; }

	public static ApiException notFound() {
		return new ApiException(HttpStatus.NOT_FOUND, "not_found", "Not found.");
	}

	public static ApiException invalid(String message, Map<String, ?> details) {
		return new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "invalid", message, details);
	}

	public static ApiException conflict(String code, String message) {
		return new ApiException(HttpStatus.CONFLICT, code, message);
	}

}
