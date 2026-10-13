package dev.pietrorussod.integrationhub.infrastructure.scheduling

import dev.pietrorussod.integrationhub.infrastructure.observability.OutboxBacklogMetrics
import io.quarkus.scheduler.Scheduled
import io.quarkus.scheduler.Scheduled.ConcurrentExecution.SKIP
import jakarta.enterprise.context.ApplicationScoped
import org.jboss.logging.Logger
import java.time.Instant

@ApplicationScoped
class OutboxBacklogMetricsScheduler(
    private val outboxBacklogMetrics: OutboxBacklogMetrics,
) {
    private val logger = Logger.getLogger(OutboxBacklogMetricsScheduler::class.java)

    @Scheduled(
        identity = "outbox-backlog-metrics",
        every = "\${integration-hub.outbox.metrics.interval}",
        concurrentExecution = SKIP,
    )
    fun refreshBacklogMetrics() {
        try {
            outboxBacklogMetrics.refresh(Instant.now())
        } catch (exception: RuntimeException) {
            logger.warnf("Outbox backlog metrics could not be refreshed: %s", exception.javaClass.simpleName)
        }
    }
}
