package dev.dinuliman.apotek.config;

import java.nio.file.Path;
import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("apotek")
public record AppProperties(Path uploadsDir, int minShelfLifeDays, Duration paymentWindow, long shippingFee, long freeShippingFrom) {
}
