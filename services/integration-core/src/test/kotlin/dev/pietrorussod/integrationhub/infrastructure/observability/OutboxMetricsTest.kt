package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.outbox.OutboxBatchDispatchResult
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class OutboxMetricsTest {
    private val registry = SimpleMeterRegistry()
    private val metrics = OutboxMetrics(registry)

    @Test
    fun `records each dispatch outcome`() {
        metrics.recordDispatch(
            OutboxBatchDispatchResult(
                claimedCount = 10,
                publishedCount = 6,
                rescheduledCount = 2,
                failedCount = 1,
                claimLostCount = 1,
            ),
        )

        assertEquals(10.0, dispatchCount("claimed"))
        assertEquals(6.0, dispatchCount("published"))
        assertEquals(2.0, dispatchCount("rescheduled"))
        assertEquals(1.0, dispatchCount("failed"))
        assertEquals(1.0, dispatchCount("claim_lost"))
    }

    @Test
    fun `records recovered claims`() {
        metrics.recordRecovered(3)

        assertEquals(3.0, registry.get(OutboxMetrics.RECOVERY_METRIC).counter().count())
    }

    @Test
    fun `rejects a negative recovered claim count`() {
        assertThrows(IllegalArgumentException::class.java) { metrics.recordRecovered(-1) }
    }

    private fun dispatchCount(outcome: String): Double =
        registry
            .get(OutboxMetrics.DISPATCH_METRIC)
            .tag("outcome", outcome)
            .counter()
            .count()
}
