package dev.dinuliman.apotek.auth;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Component;

/**
 * Slows down password guessing: at most 5 failed logins per email in 15 minutes.
 * Kept in memory, so it is per instance; a shared store would be needed behind a load balancer.
 */
@Component
public class LoginThrottle {

	static final int MAX_FAILURES = 5;
	static final Duration WINDOW = Duration.ofMinutes(15);

	private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();
	private final Clock clock;

	LoginThrottle(Clock clock) { this.clock = clock; }

	/** Seconds until the next attempt is allowed, or 0. */
	public long retryAfter(String email) {
		var q = failures.get(email);
		if (q == null) return 0;
		synchronized (q) {
			var cutoff = clock.instant().minus(WINDOW);
			while (!q.isEmpty() && q.peekFirst().isBefore(cutoff)) q.pollFirst();
			if (q.size() < MAX_FAILURES) return 0;
			return Duration.between(clock.instant(), q.peekFirst().plus(WINDOW)).toSeconds() + 1;
		}
	}

	public void failed(String email) {
		var q = failures.computeIfAbsent(email, k -> new ArrayDeque<>());
		synchronized (q) { q.addLast(clock.instant()); }
	}

	public void succeeded(String email) { failures.remove(email); }

}
