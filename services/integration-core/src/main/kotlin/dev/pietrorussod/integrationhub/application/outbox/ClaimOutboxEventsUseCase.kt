package dev.pietrorussod.integrationhub.application.outbox

import java.time.Clock
import java.util.UUID

class ClaimOutboxEventsUseCase(
    private val outboxEventRepository: OutboxEventRepository,
    private val clock: Clock,
    private val generateClaimId: () -> UUID,
) {
    fun claim(
        workerId: String,
        batchSize: Int,
    ): List<ClaimedOutboxEvent> {
        OutboxClaimPolicy.validateWorkerId(workerId)
        OutboxClaimPolicy.validateBatchSize(batchSize)

        return outboxEventRepository.claimPending(
            claimId = generateClaimId(),
            workerId = workerId,
            claimedAt = clock.instant(),
            batchSize = batchSize,
        )
    }
}
