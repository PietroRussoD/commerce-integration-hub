package dev.pietrorussod.integrationhub.infrastructure.scheduling

import dev.pietrorussod.integrationhub.application.outbox.RecoverExpiredOutboxClaimsUseCase
import dev.pietrorussod.integrationhub.infrastructure.observability.OutboxMetrics
import io.quarkus.scheduler.Scheduled
import io.quarkus.scheduler.Scheduled.ConcurrentExecution.SKIP
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.logging.Logger
import java.time.Duration

@ApplicationScoped
class OutboxClaimRecoveryScheduler(
    private val recoverExpiredOutboxClaims: RecoverExpiredOutboxClaimsUseCase,
    private val outboxMetrics: OutboxMetrics,
    @param:ConfigProperty(name = "integration-hub.outbox.recovery.claim-timeout") private val claimTimeout: Duration,
    @param:ConfigProperty(name = "integration-hub.outbox.recovery.batch-size") private val batchSize: Int,
) {
    private val logger = Logger.getLogger(OutboxClaimRecoveryScheduler::class.java)

    @Scheduled(
        identity = "outbox-claim-recovery",
        every = "\${integration-hub.outbox.recovery.interval}",
        concurrentExecution = SKIP,
    )
    fun recoverExpiredClaims() {
        val recoveredIds = recoverExpiredOutboxClaims.recover(claimTimeout, batchSize)
        outboxMetrics.recordRecovered(recoveredIds.size)

        if (recoveredIds.isNotEmpty()) {
            logger.warnf("Expired outbox claims recovered: count=%d", recoveredIds.size)
        }
    }
}
