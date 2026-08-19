package dev.pietrorussod.integrationhub.application.outbox

import java.time.Clock
import java.time.Duration
import java.util.UUID

class RecoverExpiredOutboxClaimsUseCase(
    private val outboxEventRepository: OutboxEventRepository,
    private val clock: Clock,
) {
    fun recover(
        claimTimeout: Duration,
        batchSize: Int,
    ): List<UUID> {
        require(!claimTimeout.isZero && !claimTimeout.isNegative) {
            "Outbox claim timeout must be positive"
        }
        OutboxClaimPolicy.validateBatchSize(batchSize)
        val recoveredAt = clock.instant()

        return outboxEventRepository.recoverExpiredClaims(
            expiredBefore = recoveredAt.minus(claimTimeout),
            recoveredAt = recoveredAt,
            batchSize = batchSize,
        )
    }
}
