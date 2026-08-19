package dev.pietrorussod.integrationhub.application.outbox

import java.time.Clock

class ClaimOutboxEventsUseCase(
    private val outboxEventRepository: OutboxEventRepository,
    private val clock: Clock,
) {
    fun claim(
        workerId: String,
        batchSize: Int,
    ): List<ClaimedOutboxEvent> {
        require(workerId.isNotBlank()) { "Outbox worker id must not be blank" }
        require(workerId == workerId.trim()) { "Outbox worker id must not have surrounding whitespace" }
        require(workerId.length <= MAX_WORKER_ID_LENGTH) {
            "Outbox worker id must not exceed $MAX_WORKER_ID_LENGTH characters"
        }
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "Outbox batch size must be between 1 and $MAX_BATCH_SIZE"
        }

        return outboxEventRepository.claimPending(workerId, clock.instant(), batchSize)
    }

    private companion object {
        const val MAX_WORKER_ID_LENGTH = 100
        const val MAX_BATCH_SIZE = 100
    }
}
