package dev.pietrorussod.integrationhub.application.outbox

import java.time.Clock

class FailOutboxEventUseCase(
    private val outboxEventRepository: OutboxEventRepository,
    private val clock: Clock,
) {
    fun fail(
        event: ClaimedOutboxEvent,
        errorCode: String,
        safeErrorMessage: String,
    ): Boolean {
        OutboxPublicationFailurePolicy.validate(errorCode, safeErrorMessage)

        return outboxEventRepository.markFailed(
            eventId = event.id,
            claimId = event.claimId,
            workerId = event.workerId,
            failedAt = clock.instant(),
            errorCode = errorCode,
            safeErrorMessage = safeErrorMessage,
        )
    }
}
