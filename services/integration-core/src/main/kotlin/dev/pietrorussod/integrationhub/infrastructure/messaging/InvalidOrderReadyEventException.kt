package dev.pietrorussod.integrationhub.infrastructure.messaging

class InvalidOrderReadyEventException(
    message: String,
    cause: Throwable? = null,
) : IllegalArgumentException(message, cause)
