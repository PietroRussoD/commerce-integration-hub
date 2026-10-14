package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.outbox.OutboxBacklog
import dev.pietrorussod.integrationhub.application.outbox.OutboxBacklogReader
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.quarkus.runtime.Startup
import jakarta.enterprise.context.ApplicationScoped
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicReference

/**
 * How many outbox events wait to be published, how old the oldest one is, and how
 * many failed for good. The values describe the shared database, so every Core
 * replica reports the same backlog: aggregate them with `max`, not `sum`.
 *
 * They are refreshed periodically rather than on every scrape, and read as
 * unknown (NaN) when the last refresh failed, so that a stale value never looks
 * current.
 */
@Startup
@ApplicationScoped
class OutboxBacklogMetrics(
    meterRegistry: MeterRegistry,
    private val backlogReader: OutboxBacklogReader,
) {
    private val latest = AtomicReference(UNKNOWN)

    init {
        Gauge
            .builder(BACKLOG_EVENTS_METRIC, latest) { value -> value.get().waitingEvents }
            .description("Number of outbox events waiting to be published")
            .register(meterRegistry)
        Gauge
            .builder(BACKLOG_OLDEST_AGE_METRIC, latest) { value -> value.get().oldestWaitingAgeSeconds }
            .description("Age of the oldest outbox event waiting to be published, or 0 when none waits")
            .baseUnit("seconds")
            .register(meterRegistry)
        Gauge
            .builder(FAILED_EVENTS_METRIC, latest) { value -> value.get().failedEvents }
            .description("Number of outbox events that failed terminally and will not be published")
            .register(meterRegistry)
    }

    fun refresh(observedAt: Instant) {
        val backlog =
            try {
                backlogReader.read()
            } catch (exception: RuntimeException) {
                latest.set(UNKNOWN)
                throw exception
            }
        latest.set(Snapshot.of(backlog, observedAt))
    }

    private data class Snapshot(
        val waitingEvents: Double,
        val oldestWaitingAgeSeconds: Double,
        val failedEvents: Double,
    ) {
        companion object {
            fun of(
                backlog: OutboxBacklog,
                observedAt: Instant,
            ): Snapshot =
                Snapshot(
                    waitingEvents = backlog.waitingEvents.toDouble(),
                    oldestWaitingAgeSeconds =
                        backlog.oldestWaitingCreatedAt
                            ?.let { Duration.between(it, observedAt).toMillis().coerceAtLeast(0) / 1_000.0 }
                            ?: 0.0,
                    failedEvents = backlog.failedEvents.toDouble(),
                )
        }
    }

    companion object {
        const val BACKLOG_EVENTS_METRIC = "integration.hub.outbox.backlog.events"
        const val BACKLOG_OLDEST_AGE_METRIC = "integration.hub.outbox.backlog.oldest.age"
        const val FAILED_EVENTS_METRIC = "integration.hub.outbox.failed.events"
        private val UNKNOWN = Snapshot(Double.NaN, Double.NaN, Double.NaN)
    }
}
