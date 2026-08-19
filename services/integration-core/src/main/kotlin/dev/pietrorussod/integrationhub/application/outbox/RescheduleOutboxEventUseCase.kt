package dev.pietrorussod.integrationhub.application.outbox

import java.time.Clock
import java.time.Instant

class RescheduleOutboxEventUseCase(
    private val outboxEventRepository: OutboxEventRepository,
    private val clock: Clock,
) {
    fun reschedule(
        event: ClaimedOutboxEvent,
        nextAttemptAt: Instant,
        errorCode: String,
        safeErrorMessage: String,
    ): Boolean {
        require(nextAttemptAt > clock.instant()) { "Next outbox attempt must be in the future" }
        OutboxPublicationFailurePolicy.validate(errorCode, safeErrorMessage)

        return outboxEventRepository.rescheduleAfterFailure(
            eventId = event.id,
            claimId = event.claimId,
            workerId = event.workerId,
            nextAttemptAt = nextAttemptAt,
            errorCode = errorCode,
            safeErrorMessage = safeErrorMessage,
        )
    }
}
