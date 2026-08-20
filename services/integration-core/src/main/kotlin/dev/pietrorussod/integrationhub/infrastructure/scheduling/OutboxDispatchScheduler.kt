package dev.pietrorussod.integrationhub.infrastructure.scheduling

import dev.pietrorussod.integrationhub.application.outbox.DispatchOutboxBatchUseCase
import dev.pietrorussod.integrationhub.infrastructure.observability.OutboxMetrics
import io.quarkus.scheduler.Scheduled
import io.quarkus.scheduler.Scheduled.ConcurrentExecution.SKIP
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger

@ApplicationScoped
class OutboxDispatchScheduler(
    private val dispatchOutboxBatch: DispatchOutboxBatchUseCase,
    private val outboxMetrics: OutboxMetrics,
    @param:ConfigProperty(name = "integration-hub.outbox.worker-id") private val workerId: String,
    @param:ConfigProperty(name = "integration-hub.outbox.dispatch.batch-size") private val batchSize: Int,
) {
    private val logger = Logger.getLogger(OutboxDispatchScheduler::class.java)

    @Scheduled(
        identity = "outbox-dispatch",
        every = "\${integration-hub.outbox.dispatch.interval}",
        concurrentExecution = SKIP,
    )
    fun dispatchPendingEvents() {
        val result = dispatchOutboxBatch.dispatch(workerId, batchSize)
        outboxMetrics.recordDispatch(result)

        if (result.claimedCount > 0) {
            logger.infof(
                "Outbox batch dispatched: workerId=%s claimed=%d published=%d rescheduled=%d failed=%d claimLost=%d",
                workerId,
                result.claimedCount,
                result.publishedCount,
                result.rescheduledCount,
                result.failedCount,
                result.claimLostCount,
            )
        }
    }
}
