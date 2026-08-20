package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.outbox.OutboxBatchDispatchResult
import io.micrometer.core.instrument.Counter
import io.micrometer.core.instrument.MeterRegistry
import io.quarkus.runtime.Startup
import jakarta.enterprise.context.ApplicationScoped

@Startup
@ApplicationScoped
class OutboxMetrics(
    meterRegistry: MeterRegistry,
) {
    private val claimed = dispatchCounter(meterRegistry, "claimed")
    private val published = dispatchCounter(meterRegistry, "published")
    private val rescheduled = dispatchCounter(meterRegistry, "rescheduled")
    private val failed = dispatchCounter(meterRegistry, "failed")
    private val claimLost = dispatchCounter(meterRegistry, "claim_lost")
    private val recovered =
        Counter
            .builder(RECOVERY_METRIC)
            .description("Number of expired outbox claims recovered for a later attempt")
            .register(meterRegistry)

    fun recordDispatch(result: OutboxBatchDispatchResult) {
        claimed.increment(result.claimedCount.toDouble())
        published.increment(result.publishedCount.toDouble())
        rescheduled.increment(result.rescheduledCount.toDouble())
        failed.increment(result.failedCount.toDouble())
        claimLost.increment(result.claimLostCount.toDouble())
    }

    fun recordRecovered(count: Int) {
        require(count >= 0) { "Recovered outbox event count must not be negative" }
        recovered.increment(count.toDouble())
    }

    private fun dispatchCounter(
        meterRegistry: MeterRegistry,
        outcome: String,
    ): Counter =
        Counter
            .builder(DISPATCH_METRIC)
            .description("Number of outbox events handled by dispatch outcome")
            .tag("outcome", outcome)
            .register(meterRegistry)

    companion object {
        const val DISPATCH_METRIC = "integration.hub.outbox.dispatch.events"
        const val RECOVERY_METRIC = "integration.hub.outbox.recovery.events"
    }
}
