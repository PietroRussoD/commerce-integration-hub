package dev.pietrorussod.integrationhub.application.order

class InvalidReceiveOrderCommandException(
    cause: IllegalArgumentException,
) : RuntimeException("The receive-order command is invalid", cause)
