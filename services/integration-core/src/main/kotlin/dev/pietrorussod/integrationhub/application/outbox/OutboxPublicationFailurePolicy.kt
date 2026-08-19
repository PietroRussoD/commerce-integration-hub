package dev.pietrorussod.integrationhub.application.outbox

internal object OutboxPublicationFailurePolicy {
    private val errorCodePattern = Regex("[A-Z0-9_]{1,100}")
    private const val MAX_ERROR_MESSAGE_LENGTH = 1000

    fun validate(
        errorCode: String,
        safeErrorMessage: String,
    ) {
        require(errorCodePattern.matches(errorCode)) {
            "Outbox publication error code must use 1 to 100 uppercase letters, digits, or underscores"
        }
        require(safeErrorMessage.isNotBlank()) { "Outbox publication error message must not be blank" }
        require(safeErrorMessage == safeErrorMessage.trim()) {
            "Outbox publication error message must not have surrounding whitespace"
        }
        require(safeErrorMessage.length <= MAX_ERROR_MESSAGE_LENGTH) {
            "Outbox publication error message must not exceed $MAX_ERROR_MESSAGE_LENGTH characters"
        }
    }
}
