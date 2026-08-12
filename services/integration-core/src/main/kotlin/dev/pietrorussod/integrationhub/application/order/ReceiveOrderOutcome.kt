package dev.pietrorussod.integrationhub.application.order

enum class ReceiveOrderOutcome {
    CREATED,
    ALREADY_RECEIVED,
    PAYLOAD_CONFLICT,
}
