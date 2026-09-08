package dev.pietrorussod.integrationhub.application.search

import java.time.Instant

data class OrderSearchProjectionStatus(
    val consumerEnabled: Boolean,
    val readAlias: String,
    val availability: OrderSearchProjectionAvailability,
    val reconciliationInProgress: Boolean,
    val lastReconciliationCompletedAt: Instant?,
    val lastReconciliationScannedCount: Long?,
    val lastReconciliationAppliedCount: Long?,
    val lastReconciliationIgnoredCount: Long?,
)

enum class OrderSearchProjectionAvailability {
    AVAILABLE,
    NOT_INITIALIZED,
    UNAVAILABLE,
}

interface OrderSearchProjectionStatusProvider {
    fun status(): OrderSearchProjectionStatus
}
