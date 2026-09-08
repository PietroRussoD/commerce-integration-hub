package dev.pietrorussod.integrationhub.application.search

data class OrderSearchProjectionStatus(
    val consumerEnabled: Boolean,
    val readAlias: String,
    val availability: OrderSearchProjectionAvailability,
)

enum class OrderSearchProjectionAvailability {
    AVAILABLE,
    NOT_INITIALIZED,
    UNAVAILABLE,
}

interface OrderSearchProjectionStatusProvider {
    fun status(): OrderSearchProjectionStatus
}
