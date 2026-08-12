package dev.pietrorussod.integrationhub.application.order

enum class OrderInsertOutcome {
    INSERTED,
    EQUIVALENT_REPLAY,
    PAYLOAD_CONFLICT,
}
