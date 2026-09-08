package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.quarkus.runtime.Startup
import jakarta.enterprise.context.ApplicationScoped

@Startup
@ApplicationScoped
class OrderSearchProjectionMetrics(
    meterRegistry: MeterRegistry,
) {
    private val applied = eventCounter(meterRegistry, "applied")
    private val ignoredNonNewerVersion = eventCounter(meterRegistry, "ignored_non_newer_version")
    private val invalidEvent = eventCounter(meterRegistry, "invalid_event")
    private val failedAttempt = eventCounter(meterRegistry, "failed_attempt")

    fun recordProjection(outcome: OrderSearchProjectionWriteOutcome) {
        when (outcome) {
            OrderSearchProjectionWriteOutcome.APPLIED -> applied.increment()
            OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION -> ignoredNonNewerVersion.increment()
        }
    }

    fun recordInvalidEvent() {
        invalidEvent.increment()
    }

    fun recordFailedAttempt() {
        failedAttempt.increment()
    }

    private fun eventCounter(
        meterRegistry: MeterRegistry,
        outcome: String,
    ): Counter =
        Counter
            .builder(EVENT_METRIC)
            .description("Number of order search projection consumer outcomes")
            .tag("outcome", outcome)
            .register(meterRegistry)

    companion object {
        const val EVENT_METRIC = "integration.hub.order.search.projection.events"
    }
}
