package dev.pietrorussod.integrationhub.infrastructure.messaging

class InvalidOrderReceivedEventException(
    message: String,
    cause: Throwable? = null,
) : IllegalArgumentException(message, cause)
