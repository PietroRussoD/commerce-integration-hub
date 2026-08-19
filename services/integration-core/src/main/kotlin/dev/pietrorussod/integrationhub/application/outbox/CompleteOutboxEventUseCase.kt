package dev.pietrorussod.integrationhub.application.outbox

import java.time.Clock

class CompleteOutboxEventUseCase(
    private val outboxEventRepository: OutboxEventRepository,
    private val clock: Clock,
) {
    fun complete(event: ClaimedOutboxEvent): Boolean =
        outboxEventRepository.markPublished(
            eventId = event.id,
            claimId = event.claimId,
            workerId = event.workerId,
            publishedAt = clock.instant(),
        )
}
