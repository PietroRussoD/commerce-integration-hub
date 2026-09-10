package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgressRepository
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationBatchResult
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationRunResult
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import java.util.UUID

class OrderSearchProjectionMetricsTest {
    private val registry = SimpleMeterRegistry()

    @Test
    fun `records bounded projection outcomes`() {
        val metrics = metrics()
        metrics.recordProjection(OrderSearchProjectionWriteOutcome.APPLIED)
        metrics.recordProjection(OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION)
        metrics.recordInvalidEvent()
        metrics.recordFailedAttempt()

        assertEquals(1.0, count("applied"))
        assertEquals(1.0, count("ignored_non_newer_version"))
        assertEquals(1.0, count("invalid_event"))
        assertEquals(1.0, count("failed_attempt"))
    }

    @Test
    fun `records reconciliation outcomes documents and duration`() {
        val metrics = metrics()
        metrics.recordReconciliation(
            OrderSearchProjectionReconciliationRunResult.Advanced(
                OrderSearchProjectionReconciliationBatchResult(
                    scannedCount = 3,
                    appliedCount = 2,
                    ignoredNonNewerVersionCount = 1,
                    nextCursor = ReadyOrderSearchDocumentCursor(Instant.parse("2026-09-08T08:00:00Z"), UUID.randomUUID()),
                ),
            ),
            Duration.ofMillis(50),
        )
        metrics.recordReconciliation(OrderSearchProjectionReconciliationRunResult.Completed, Duration.ofMillis(10))
        metrics.recordReconciliation(OrderSearchProjectionReconciliationRunResult.LeaseUnavailable, Duration.ofMillis(1))
        metrics.recordReconciliation(OrderSearchProjectionReconciliationRunResult.StateChanged, Duration.ofMillis(2))
        metrics.recordReconciliationFailure(Duration.ofMillis(3))

        assertEquals(1.0, reconciliationRunCount("advanced"))
        assertEquals(1.0, reconciliationRunCount("completed"))
        assertEquals(1.0, reconciliationRunCount("lease_unavailable"))
        assertEquals(1.0, reconciliationRunCount("state_changed"))
        assertEquals(1.0, reconciliationRunCount("failed"))
        assertEquals(3.0, reconciliationDocumentCount("scanned"))
        assertEquals(2.0, reconciliationDocumentCount("applied"))
        assertEquals(1.0, reconciliationDocumentCount("ignored_non_newer_version"))
        assertEquals(5L, registry.get(OrderSearchProjectionMetrics.RECONCILIATION_DURATION_METRIC).timer().count())
    }

    @Test
    fun `restores and advances persisted projection progress gauges`() {
        val restoredEventAt = Instant.parse("2026-09-09T08:00:00Z")
        val restoredProjectedAt = Instant.parse("2026-09-09T08:00:00.250Z")
        val metrics =
            metrics(
                OrderSearchProjectionProgress(
                    lastProjectedEventOccurredAt = restoredEventAt,
                    lastProjectedAt = restoredProjectedAt,
                ),
            )

        assertEquals(250.0, projectionProcessingDelay())
        metrics.recordProjectionProgress(
            eventOccurredAt = Instant.parse("2026-09-09T08:00:02Z"),
            projectedAt = Instant.parse("2026-09-09T08:00:02.500Z"),
        )

        assertEquals(500.0, projectionProcessingDelay())
        assertEquals(true, projectionWatermarkAge() >= 0.0)
    }

    private fun metrics(
        initialProgress: OrderSearchProjectionProgress = OrderSearchProjectionProgress(null, null),
    ): OrderSearchProjectionMetrics =
        OrderSearchProjectionMetrics(
            registry,
            object : OrderSearchProjectionProgressRepository {
                override fun current(): OrderSearchProjectionProgress = initialProgress

                override fun recordSuccessfulProjection(
                    eventOccurredAt: Instant,
                    projectedAt: Instant,
                ): Boolean = false
            },
        )

    private fun count(outcome: String): Double =
        registry
            .get(OrderSearchProjectionMetrics.EVENT_METRIC)
            .tag("outcome", outcome)
            .counter()
            .count()

    private fun reconciliationRunCount(outcome: String): Double =
        registry
            .get(OrderSearchProjectionMetrics.RECONCILIATION_RUN_METRIC)
            .tag("outcome", outcome)
            .counter()
            .count()

    private fun reconciliationDocumentCount(outcome: String): Double =
        registry
            .get(OrderSearchProjectionMetrics.RECONCILIATION_DOCUMENT_METRIC)
            .tag("outcome", outcome)
            .counter()
            .count()

    private fun projectionProcessingDelay(): Double =
        registry.get(OrderSearchProjectionMetrics.PROJECTION_PROCESSING_DELAY_METRIC).gauge().value()

    private fun projectionWatermarkAge(): Double =
        registry.get(OrderSearchProjectionMetrics.PROJECTION_WATERMARK_AGE_METRIC).gauge().value()
}
