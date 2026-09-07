package dev.pietrorussod.integrationhub.application.search

interface OrderSearchProjection {
    fun upsert(document: OrderSearchDocument): OrderSearchProjectionWriteOutcome
}

enum class OrderSearchProjectionWriteOutcome {
    APPLIED,
    IGNORED_NON_NEWER_VERSION,
}
