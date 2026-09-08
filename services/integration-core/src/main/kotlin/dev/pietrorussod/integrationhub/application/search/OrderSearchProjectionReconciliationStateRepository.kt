package dev.pietrorussod.integrationhub.application.search

import java.time.Instant

interface OrderSearchProjectionReconciliationStateRepository {
    fun current(): OrderSearchProjectionReconciliationState

    fun tryAcquireLease(
        owner: String,
        token: java.util.UUID,
        acquiredAt: Instant,
        expiresAt: Instant,
    ): OrderSearchProjectionReconciliationState?

    fun releaseLease(token: java.util.UUID): Boolean

    fun advance(
        expectedVersion: Long,
        leaseToken: java.util.UUID,
        cursor: ReadyOrderSearchDocumentCursor,
        batch: OrderSearchProjectionReconciliationBatchResult,
    ): Boolean

    fun complete(
        expectedVersion: Long,
        leaseToken: java.util.UUID,
        completedAt: Instant,
    ): Boolean
}

data class OrderSearchProjectionReconciliationState(
    val version: Long,
    val cursor: ReadyOrderSearchDocumentCursor?,
    val lease: OrderSearchProjectionReconciliationLease?,
    val currentRun: OrderSearchProjectionReconciliationProgress,
    val lastCompletedRun: OrderSearchProjectionReconciliationCompletedRun?,
) {
    init {
        require(version >= 0) { "Order search reconciliation state version must not be negative" }
        require((cursor == null) == currentRun.isEmpty) {
            "Order search reconciliation cursor must be present exactly while a run has progress"
        }
    }
}

data class OrderSearchProjectionReconciliationLease(
    val owner: String,
    val token: java.util.UUID,
    val expiresAt: Instant,
) {
    init {
        require(owner.isNotBlank()) { "Order search reconciliation lease owner must not be blank" }
    }
}

data class OrderSearchProjectionReconciliationProgress(
    val scannedCount: Long,
    val appliedCount: Long,
    val ignoredNonNewerVersionCount: Long,
) {
    init {
        require(listOf(scannedCount, appliedCount, ignoredNonNewerVersionCount).all { it >= 0 }) {
            "Order search reconciliation progress counts must not be negative"
        }
        require(scannedCount == appliedCount + ignoredNonNewerVersionCount) {
            "Order search reconciliation progress counts must equal the scanned count"
        }
    }

    val isEmpty: Boolean
        get() = scannedCount == 0L
}

data class OrderSearchProjectionReconciliationCompletedRun(
    val completedAt: Instant,
    val progress: OrderSearchProjectionReconciliationProgress,
)
