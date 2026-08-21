package dev.pietrorussod.integrationhub.application.processing

interface ProcessingAttemptRepository {
    fun create(attempt: ProcessingAttempt)

    fun complete(attempt: ProcessingAttempt)
}
