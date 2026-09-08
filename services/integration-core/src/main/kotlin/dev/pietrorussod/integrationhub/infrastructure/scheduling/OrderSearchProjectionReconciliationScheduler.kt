package dev.pietrorussod.integrationhub.infrastructure.scheduling

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationRunResult
import dev.pietrorussod.integrationhub.application.search.RunOrderSearchProjectionReconciliationUseCase
import dev.pietrorussod.integrationhub.infrastructure.observability.OrderSearchProjectionMetrics
import io.quarkus.scheduler.Scheduled
import io.quarkus.scheduler.Scheduled.ConcurrentExecution.SKIP
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import java.time.Duration

@ApplicationScoped
class OrderSearchProjectionReconciliationScheduler(
    private val runReconciliation: RunOrderSearchProjectionReconciliationUseCase,
    private val metrics: OrderSearchProjectionMetrics,
    @param:ConfigProperty(name = "integration-hub.order-search.reconciliation.enabled") private val enabled: Boolean,
    @param:ConfigProperty(name = "integration-hub.order-search.reconciliation.worker-id") private val workerId: String,
    @param:ConfigProperty(name = "integration-hub.order-search.reconciliation.lease-duration") private val leaseDuration: Duration,
    @param:ConfigProperty(name = "integration-hub.order-search.reconciliation.batch-size") private val batchSize: Int,
) {
    private val logger = Logger.getLogger(OrderSearchProjectionReconciliationScheduler::class.java)

    @Scheduled(
        identity = "order-search-projection-reconciliation",
        every = "\${integration-hub.order-search.reconciliation.interval}",
        concurrentExecution = SKIP,
    )
    fun reconcile() {
        if (!enabled) {
            return
        }

        val startedAt = System.nanoTime()
        val result =
            try {
                runReconciliation.run(workerId, leaseDuration, batchSize)
            } catch (exception: RuntimeException) {
                metrics.recordReconciliationFailure(Duration.ofNanos(System.nanoTime() - startedAt))
                throw exception
            }
        metrics.recordReconciliation(result, Duration.ofNanos(System.nanoTime() - startedAt))

        when (result) {
            is OrderSearchProjectionReconciliationRunResult.Advanced -> {
                logger.infof(
                    "Order search reconciliation advanced: scanned=%d applied=%d ignored=%d",
                    result.batch.scannedCount,
                    result.batch.appliedCount,
                    result.batch.ignoredNonNewerVersionCount,
                )
            }

            OrderSearchProjectionReconciliationRunResult.Completed -> {
                logger.info("Order search reconciliation completed")
            }

            OrderSearchProjectionReconciliationRunResult.LeaseUnavailable -> {
                logger.debug("Order search reconciliation lease is held by another instance")
            }

            OrderSearchProjectionReconciliationRunResult.StateChanged -> {
                logger.debug("Order search reconciliation checkpoint changed before it could be advanced")
            }
        }
    }
}
