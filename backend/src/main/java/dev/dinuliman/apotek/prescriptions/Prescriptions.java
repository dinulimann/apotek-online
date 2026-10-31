package dev.dinuliman.apotek.prescriptions;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import java.util.UUID;

import dev.dinuliman.apotek.config.AppProperties;
import dev.dinuliman.apotek.web.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Stores prescription scans outside the web root under random names. The type is decided from the
 * file's first bytes, not from its name or the Content-Type the browser sent.
 */
@Service
public class Prescriptions {

	public record Prescription(long id, long ownerId, String contentType, int sizeBytes, String doctorName, Instant uploadedAt) {
	}

	static final int MAX_BYTES = 5 * 1024 * 1024;

	private final JdbcClient db;
	private final Path dir;

	Prescriptions(JdbcClient db, AppProperties props) throws IOException {
		this.db = db;
		this.dir = props.uploadsDir().resolve("prescriptions").toAbsolutePath().normalize();
		Files.createDirectories(dir);
	}

	static String sniff(byte[] head) {
		if (head.length >= 3 && (head[0] & 0xff) == 0xFF && (head[1] & 0xff) == 0xD8 && (head[2] & 0xff) == 0xFF) return "image/jpeg";
		if (head.length >= 8 && (head[0] & 0xff) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G' && head[4] == 0x0D && head[5] == 0x0A && head[6] == 0x1A && head[7] == 0x0A) return "image/png";
		if (head.length >= 5 && head[0] == '%' && head[1] == 'P' && head[2] == 'D' && head[3] == 'F' && head[4] == '-') return "application/pdf";
		return null;
	}

	public Prescription store(long ownerId, MultipartFile file, String doctorName) {
		if (file.isEmpty()) throw ApiException.invalid("Choose a file to upload.", java.util.Map.of("file", "is empty"));
		if (file.getSize() > MAX_BYTES) throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "file_too_large", "Files can be at most 5 MB.");
		byte[] bytes;
		try (InputStream in = file.getInputStream()) {
			bytes = in.readNBytes(MAX_BYTES + 1);
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		return store(ownerId, bytes, doctorName);
	}

	public Prescription store(long ownerId, byte[] bytes, String doctorName) {
		if (bytes.length > MAX_BYTES) throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "file_too_large", "Files can be at most 5 MB.");
		String type = sniff(bytes);
		if (type == null) {
			throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "unsupported_file", "Upload a photo (JPEG or PNG) or a PDF of the prescription.");
		}
		String key = UUID.randomUUID().toString();
		try {
			Files.write(dir.resolve(key), bytes);
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
		String doctor = doctorName == null ? "" : doctorName.trim();
		if (doctor.length() > 80) doctor = doctor.substring(0, 80);
		long id = db.sql("insert into prescriptions (owner_id, storage_key, content_type, size_bytes, sha256, doctor_name) values (?, ?, ?, ?, ?, ?) returning id")
			.params(ownerId, key, type, bytes.length, sha256(bytes), doctor).query(Long.class).single();
		return find(id).orElseThrow();
	}

	public Optional<Prescription> find(long id) {
		return db.sql("select id, owner_id, content_type, size_bytes, doctor_name, uploaded_at from prescriptions where id = ?").param(id)
			.query((rs, n) -> new Prescription(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getInt(4), rs.getString(5), rs.getTimestamp(6).toInstant())).optional();
	}

	public byte[] read(long id) {
		String key = db.sql("select storage_key from prescriptions where id = ?").param(id).query(String.class).single();
		try {
			return Files.readAllBytes(dir.resolve(key));
		} catch (java.nio.file.NoSuchFileException e) {
			// The row exists but the file does not, e.g. the uploads volume was replaced.
			org.slf4j.LoggerFactory.getLogger(Prescriptions.class).warn("Prescription {} has no file at {}", id, key);
			throw new ApiException(HttpStatus.NOT_FOUND, "file_missing", "The prescription file is no longer available.");
		} catch (IOException e) {
			throw new UncheckedIOException(e);
		}
	}

	private static String sha256(byte[] bytes) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
		} catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}

}
