package dev.dinuliman.apotek.orders;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Returns stock held by orders nobody paid for. */
@Component
class PaymentExpiry {

	private static final Logger log = LoggerFactory.getLogger(PaymentExpiry.class);
	private final Orders orders;

	PaymentExpiry(Orders orders) { this.orders = orders; }

	@Scheduled(fixedDelayString = "PT1M", initialDelayString = "PT1M")
	void run() {
		int n = orders.expireUnpaid();
		if (n > 0) log.info("Cancelled {} unpaid orders and returned their stock", n);
	}

}
