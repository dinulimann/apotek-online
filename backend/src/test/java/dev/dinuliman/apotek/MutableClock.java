package dev.dinuliman.apotek;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.concurrent.atomic.AtomicReference;

import dev.dinuliman.apotek.config.ClockConfig;

/** A clock tests can move forward. */
public class MutableClock extends Clock {

	private final AtomicReference<Instant> now = new AtomicReference<>(Instant.now());

	public void reset() { now.set(Instant.now()); }
	public void advance(Duration d) { now.updateAndGet(t -> t.plus(d)); }

	@Override public ZoneId getZone() { return ClockConfig.JAKARTA; }
	@Override public Clock withZone(ZoneId zone) { return this; }
	@Override public Instant instant() { return now.get(); }

}
