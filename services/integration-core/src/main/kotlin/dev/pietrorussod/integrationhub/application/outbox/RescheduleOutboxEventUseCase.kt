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
        require(ERROR_CODE_PATTERN.matches(errorCode)) {
            "Outbox publication error code must use 1 to 100 uppercase letters, digits, or underscores"
        }
        require(safeErrorMessage.isNotBlank()) { "Outbox publication error message must not be blank" }
        require(safeErrorMessage == safeErrorMessage.trim()) {
            "Outbox publication error message must not have surrounding whitespace"
        }
        require(safeErrorMessage.length <= MAX_ERROR_MESSAGE_LENGTH) {
            "Outbox publication error message must not exceed $MAX_ERROR_MESSAGE_LENGTH characters"
        }

        return outboxEventRepository.rescheduleAfterFailure(
            eventId = event.id,
            claimId = event.claimId,
            workerId = event.workerId,
            nextAttemptAt = nextAttemptAt,
            errorCode = errorCode,
            safeErrorMessage = safeErrorMessage,
        )
    }

    private companion object {
        val ERROR_CODE_PATTERN = Regex("[A-Z0-9_]{1,100}")
        const val MAX_ERROR_MESSAGE_LENGTH = 1000
    }
}
