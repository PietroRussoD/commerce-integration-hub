package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexBatchResult
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexCutoverOutcome
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexRunResult
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexValidationResult
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class OrderSearchReindexMetricsTest {
    private val registry = SimpleMeterRegistry()
    private val metrics = OrderSearchReindexMetrics(registry)

    @Test
    fun `records reindex outcomes documents and duration`() {
        metrics.record(
            OrderSearchReindexRunResult.Advanced(
                OrderSearchReindexBatchResult(
                    scannedCount = 3,
                    appliedCount = 2,
                    ignoredNonNewerVersionCount = 1,
                    nextCursor = ReadyOrderSearchDocumentCursor(Instant.parse("2026-09-09T08:00:00Z"), UUID.randomUUID()),
                ),
            ),
            Duration.ofMillis(50),
        )
        metrics.record(OrderSearchReindexRunResult.CandidatePrepared, Duration.ofMillis(1))
        metrics.record(OrderSearchReindexRunResult.ReadyForCutover, Duration.ofMillis(2))
        metrics.record(OrderSearchReindexRunResult.Completed(OrderSearchReindexCutoverOutcome.CUT_OVER), Duration.ofMillis(3))
        metrics.record(
            OrderSearchReindexRunResult.ValidationFailed(OrderSearchReindexValidationResult(3, 2)),
            Duration.ofMillis(4),
        )
        metrics.record(OrderSearchReindexRunResult.LeaseUnavailable, Duration.ofMillis(5))
        metrics.record(OrderSearchReindexRunResult.StateChanged, Duration.ofMillis(6))
        metrics.recordFailure(Duration.ofMillis(7))

        assertEquals(1.0, runCount("advanced"))
        assertEquals(1.0, runCount("candidate_prepared"))
        assertEquals(1.0, runCount("ready_for_cutover"))
        assertEquals(1.0, runCount("completed"))
        assertEquals(1.0, runCount("validation_failed"))
        assertEquals(1.0, runCount("lease_unavailable"))
        assertEquals(1.0, runCount("state_changed"))
        assertEquals(1.0, runCount("failed"))
        assertEquals(3.0, documentCount("scanned"))
        assertEquals(2.0, documentCount("applied"))
        assertEquals(1.0, documentCount("ignored_non_newer_version"))
        assertEquals(8L, registry.get(OrderSearchReindexMetrics.DURATION_METRIC).timer().count())
    }

    private fun runCount(outcome: String): Double =
        registry
            .get(OrderSearchReindexMetrics.RUN_METRIC)
            .tag("outcome", outcome)
            .counter()
            .count()

    private fun documentCount(outcome: String): Double =
        registry
            .get(OrderSearchReindexMetrics.DOCUMENT_METRIC)
            .tag("outcome", outcome)
            .counter()
            .count()
}
