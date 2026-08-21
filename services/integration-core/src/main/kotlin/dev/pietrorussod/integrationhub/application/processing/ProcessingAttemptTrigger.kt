package dev.pietrorussod.integrationhub.application.processing

enum class ProcessingAttemptTrigger {
    INITIAL,
    AUTOMATIC_RETRY,
    MANUAL_RETRY,
}
