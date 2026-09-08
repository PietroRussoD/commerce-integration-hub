package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class OrderSearchProjectionMetricsTest {
    private val registry = SimpleMeterRegistry()
    private val metrics = OrderSearchProjectionMetrics(registry)

    @Test
    fun `records bounded projection outcomes`() {
        metrics.recordProjection(OrderSearchProjectionWriteOutcome.APPLIED)
        metrics.recordProjection(OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION)
        metrics.recordInvalidEvent()
        metrics.recordFailedAttempt()

        assertEquals(1.0, count("applied"))
        assertEquals(1.0, count("ignored_non_newer_version"))
        assertEquals(1.0, count("invalid_event"))
        assertEquals(1.0, count("failed_attempt"))
    }

    private fun count(outcome: String): Double =
        registry
            .get(OrderSearchProjectionMetrics.EVENT_METRIC)
            .tag("outcome", outcome)
            .counter()
            .count()
}
