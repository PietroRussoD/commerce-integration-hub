package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgressRepository
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationRunResult
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.Gauge
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import io.quarkus.runtime.Startup
import jakarta.enterprise.context.ApplicationScoped
import java.time.Duration
import java.time.Instant
import java.util.concurrent.atomic.AtomicLong

@Startup
@ApplicationScoped
class OrderSearchProjectionMetrics(
    meterRegistry: MeterRegistry,
    progressRepository: OrderSearchProjectionProgressRepository,
) {
    private val lastProjectionDelayMilliseconds = AtomicLong(NO_PROJECTION_RECORDED)
    private val lastProjectedAtEpochMilliseconds = AtomicLong(NO_PROJECTION_RECORDED)
    private val applied = eventCounter(meterRegistry, "applied")
    private val ignoredNonNewerVersion = eventCounter(meterRegistry, "ignored_non_newer_version")
    private val invalidEvent = eventCounter(meterRegistry, "invalid_event")
    private val failedAttempt = eventCounter(meterRegistry, "failed_attempt")
    private val reconciliationAdvanced = reconciliationRunCounter(meterRegistry, "advanced")
    private val reconciliationCompleted = reconciliationRunCounter(meterRegistry, "completed")
    private val reconciliationLeaseUnavailable = reconciliationRunCounter(meterRegistry, "lease_unavailable")
    private val reconciliationStateChanged = reconciliationRunCounter(meterRegistry, "state_changed")
    private val reconciliationFailed = reconciliationRunCounter(meterRegistry, "failed")
    private val reconciliationScanned = reconciliationDocumentCounter(meterRegistry, "scanned")
    private val reconciliationApplied = reconciliationDocumentCounter(meterRegistry, "applied")
    private val reconciliationIgnored = reconciliationDocumentCounter(meterRegistry, "ignored_non_newer_version")
    private val reconciliationDuration =
        Timer
            .builder(RECONCILIATION_DURATION_METRIC)
            .description("Duration of order search projection reconciliation runs")
            .register(meterRegistry)

    init {
        updateProjectionProgress(progressRepository.current())
        Gauge
            .builder(PROJECTION_PROCESSING_DELAY_METRIC, lastProjectionDelayMilliseconds) { value -> value.get().toDouble() }
            .description("Processing delay of the latest advanced order search projection watermark")
            .baseUnit("milliseconds")
            .register(meterRegistry)
        Gauge
            .builder(PROJECTION_WATERMARK_AGE_METRIC, lastProjectedAtEpochMilliseconds) { value -> watermarkAge(value.get()) }
            .description("Age of the latest advanced order search projection watermark")
            .baseUnit("milliseconds")
            .register(meterRegistry)
    }

    fun recordProjection(outcome: OrderSearchProjectionWriteOutcome) {
        when (outcome) {
            OrderSearchProjectionWriteOutcome.APPLIED -> applied.increment()
            OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION -> ignoredNonNewerVersion.increment()
        }
    }

    fun recordProjectionProgress(
        eventOccurredAt: Instant,
        projectedAt: Instant,
    ) {
        updateProjectionProgress(
            OrderSearchProjectionProgress(
                lastProjectedEventOccurredAt = eventOccurredAt,
                lastProjectedAt = projectedAt,
            ),
        )
    }

    fun recordInvalidEvent() {
        invalidEvent.increment()
    }

    fun recordFailedAttempt() {
        failedAttempt.increment()
    }

    fun recordReconciliation(
        result: OrderSearchProjectionReconciliationRunResult,
        duration: Duration,
    ) {
        reconciliationDuration.record(duration)
        when (result) {
            is OrderSearchProjectionReconciliationRunResult.Advanced -> {
                reconciliationAdvanced.increment()
                reconciliationScanned.increment(result.batch.scannedCount.toDouble())
                reconciliationApplied.increment(result.batch.appliedCount.toDouble())
                reconciliationIgnored.increment(result.batch.ignoredNonNewerVersionCount.toDouble())
            }

            OrderSearchProjectionReconciliationRunResult.Completed -> {
                reconciliationCompleted.increment()
            }

            OrderSearchProjectionReconciliationRunResult.LeaseUnavailable -> {
                reconciliationLeaseUnavailable.increment()
            }

            OrderSearchProjectionReconciliationRunResult.StateChanged -> {
                reconciliationStateChanged.increment()
            }
        }
    }

    fun recordReconciliationFailure(duration: Duration) {
        reconciliationDuration.record(duration)
        reconciliationFailed.increment()
    }

    private fun updateProjectionProgress(progress: OrderSearchProjectionProgress) {
        val eventOccurredAt = progress.lastProjectedEventOccurredAt ?: return
        val projectedAt = requireNotNull(progress.lastProjectedAt)
        lastProjectionDelayMilliseconds.set(Duration.between(eventOccurredAt, projectedAt).toMillis())
        lastProjectedAtEpochMilliseconds.set(projectedAt.toEpochMilli())
    }

    private fun watermarkAge(lastProjectedAtEpochMilliseconds: Long): Double =
        if (lastProjectedAtEpochMilliseconds == NO_PROJECTION_RECORDED) {
            Double.NaN
        } else {
            Duration
                .between(Instant.ofEpochMilli(lastProjectedAtEpochMilliseconds), Instant.now())
                .toMillis()
                .coerceAtLeast(0)
                .toDouble()
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

    private fun reconciliationRunCounter(
        meterRegistry: MeterRegistry,
        outcome: String,
    ): Counter =
        Counter
            .builder(RECONCILIATION_RUN_METRIC)
            .description("Number of order search projection reconciliation runs by outcome")
            .tag("outcome", outcome)
            .register(meterRegistry)

    private fun reconciliationDocumentCounter(
        meterRegistry: MeterRegistry,
        outcome: String,
    ): Counter =
        Counter
            .builder(RECONCILIATION_DOCUMENT_METRIC)
            .description("Number of order search projection reconciliation documents by outcome")
            .tag("outcome", outcome)
            .register(meterRegistry)

    companion object {
        const val EVENT_METRIC = "integration.hub.order.search.projection.events"
        const val RECONCILIATION_RUN_METRIC = "integration.hub.order.search.reconciliation.runs"
        const val RECONCILIATION_DOCUMENT_METRIC = "integration.hub.order.search.reconciliation.documents"
        const val RECONCILIATION_DURATION_METRIC = "integration.hub.order.search.reconciliation.duration"
        const val PROJECTION_PROCESSING_DELAY_METRIC = "integration.hub.order.search.projection.processing.delay"
        const val PROJECTION_WATERMARK_AGE_METRIC = "integration.hub.order.search.projection.watermark.age"
        const val NO_PROJECTION_RECORDED = -1L
    }
}
