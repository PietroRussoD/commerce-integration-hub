package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexRunResult
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.micrometer.core.instrument.Timer
import io.quarkus.runtime.Startup
import jakarta.enterprise.context.ApplicationScoped
import java.time.Duration

@Startup
@ApplicationScoped
class OrderSearchReindexMetrics(
    meterRegistry: MeterRegistry,
) {
    private val candidatePrepared = runCounter(meterRegistry, "candidate_prepared")
    private val advanced = runCounter(meterRegistry, "advanced")
    private val readyForCutover = runCounter(meterRegistry, "ready_for_cutover")
    private val completed = runCounter(meterRegistry, "completed")
    private val validationFailed = runCounter(meterRegistry, "validation_failed")
    private val leaseUnavailable = runCounter(meterRegistry, "lease_unavailable")
    private val stateChanged = runCounter(meterRegistry, "state_changed")
    private val failed = runCounter(meterRegistry, "failed")
    private val scanned = documentCounter(meterRegistry, "scanned")
    private val applied = documentCounter(meterRegistry, "applied")
    private val ignoredNonNewerVersion = documentCounter(meterRegistry, "ignored_non_newer_version")
    private val duration =
        Timer
            .builder(DURATION_METRIC)
            .description("Duration of order search reindex runs")
            .register(meterRegistry)

    fun record(
        result: OrderSearchReindexRunResult,
        elapsed: Duration,
    ) {
        duration.record(elapsed)
        when (result) {
            is OrderSearchReindexRunResult.Advanced -> {
                advanced.increment()
                scanned.increment(result.batch.scannedCount.toDouble())
                applied.increment(result.batch.appliedCount.toDouble())
                ignoredNonNewerVersion.increment(result.batch.ignoredNonNewerVersionCount.toDouble())
            }

            OrderSearchReindexRunResult.CandidatePrepared -> {
                candidatePrepared.increment()
            }

            OrderSearchReindexRunResult.ReadyForCutover -> {
                readyForCutover.increment()
            }

            is OrderSearchReindexRunResult.Completed -> {
                completed.increment()
            }

            is OrderSearchReindexRunResult.ValidationFailed -> {
                validationFailed.increment()
            }

            OrderSearchReindexRunResult.LeaseUnavailable -> {
                leaseUnavailable.increment()
            }

            OrderSearchReindexRunResult.StateChanged -> {
                stateChanged.increment()
            }
        }
    }

    fun recordFailure(elapsed: Duration) {
        duration.record(elapsed)
        failed.increment()
    }

    private fun runCounter(
        meterRegistry: MeterRegistry,
        outcome: String,
    ): Counter =
        Counter
            .builder(RUN_METRIC)
            .description("Number of order search reindex runs by outcome")
            .tag("outcome", outcome)
            .register(meterRegistry)

    private fun documentCounter(
        meterRegistry: MeterRegistry,
        outcome: String,
    ): Counter =
        Counter
            .builder(DOCUMENT_METRIC)
            .description("Number of order search reindex documents by outcome")
            .tag("outcome", outcome)
            .register(meterRegistry)

    companion object {
        const val RUN_METRIC = "integration.hub.order.search.reindex.runs"
        const val DOCUMENT_METRIC = "integration.hub.order.search.reindex.documents"
        const val DURATION_METRIC = "integration.hub.order.search.reindex.duration"
    }
}
