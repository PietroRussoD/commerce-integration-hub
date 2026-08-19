package dev.pietrorussod.integrationhub.application.outbox

fun interface OutboxEventPublisher {
    fun publish(event: OutboundIntegrationEvent): PublicationOutcome
}

sealed interface PublicationOutcome {
    data object Acknowledged : PublicationOutcome

    data class Failed(
        val kind: PublicationFailureKind,
        val errorCode: String,
        val safeErrorMessage: String,
    ) : PublicationOutcome
}

enum class PublicationFailureKind {
    RETRYABLE,
    NON_RETRYABLE,
}
