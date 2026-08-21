package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.OrderId
import java.time.Instant
import java.util.UUID

@ConsistentCopyVisibility
data class ProcessingAttempt private constructor(
    val id: UUID,
    val orderId: OrderId,
    val attemptNumber: Int,
    val status: ProcessingAttemptStatus,
    val trigger: ProcessingAttemptTrigger,
    val errorCode: String?,
    val errorMessage: String?,
    val startedAt: Instant,
    val completedAt: Instant?,
) {
    fun markSucceeded(completedAt: Instant): ProcessingAttempt {
        check(status == ProcessingAttemptStatus.STARTED) {
            "Only a started processing attempt can succeed"
        }
        require(!completedAt.isBefore(startedAt)) {
            "Processing attempt completion cannot precede its start"
        }

        return copy(
            status = ProcessingAttemptStatus.SUCCEEDED,
            completedAt = completedAt,
        )
    }

    fun markFailed(
        completedAt: Instant,
        errorCode: String,
        errorMessage: String,
    ): ProcessingAttempt {
        check(status == ProcessingAttemptStatus.STARTED) {
            "Only a started processing attempt can fail"
        }
        require(!completedAt.isBefore(startedAt)) {
            "Processing attempt completion cannot precede its start"
        }
        require(errorCode.isNotBlank()) { "Processing error code must not be blank" }
        require(errorCode.length <= MAX_ERROR_CODE_LENGTH) {
            "Processing error code must be at most $MAX_ERROR_CODE_LENGTH characters"
        }
        require(errorMessage.isNotBlank()) { "Processing error message must not be blank" }
        require(errorMessage.length <= MAX_ERROR_MESSAGE_LENGTH) {
            "Processing error message must be at most $MAX_ERROR_MESSAGE_LENGTH characters"
        }

        return copy(
            status = ProcessingAttemptStatus.FAILED,
            errorCode = errorCode,
            errorMessage = errorMessage,
            completedAt = completedAt,
        )
    }

    companion object {
        private const val MAX_ERROR_CODE_LENGTH = 100
        private const val MAX_ERROR_MESSAGE_LENGTH = 1000

        fun start(
            id: UUID,
            orderId: OrderId,
            attemptNumber: Int,
            trigger: ProcessingAttemptTrigger,
            startedAt: Instant,
        ): ProcessingAttempt {
            require(attemptNumber > 0) { "Processing attempt number must be positive" }

            return ProcessingAttempt(
                id = id,
                orderId = orderId,
                attemptNumber = attemptNumber,
                status = ProcessingAttemptStatus.STARTED,
                trigger = trigger,
                errorCode = null,
                errorMessage = null,
                startedAt = startedAt,
                completedAt = null,
            )
        }
    }
}
