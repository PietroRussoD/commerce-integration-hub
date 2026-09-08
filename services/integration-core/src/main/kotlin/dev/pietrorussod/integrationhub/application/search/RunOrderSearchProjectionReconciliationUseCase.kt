package dev.pietrorussod.integrationhub.application.search

import java.time.Clock
import java.time.Duration
import java.util.UUID

class RunOrderSearchProjectionReconciliationUseCase(
    private val reconciliationStateRepository: OrderSearchProjectionReconciliationStateRepository,
    private val reconcileOrderSearchProjection: ReconcileOrderSearchProjectionUseCase,
    private val clock: Clock,
) {
    fun run(
        owner: String,
        leaseDuration: Duration,
        batchSize: Int,
    ): OrderSearchProjectionReconciliationRunResult {
        require(owner.isNotBlank()) { "Order search reconciliation lease owner must not be blank" }
        require(!leaseDuration.isNegative && !leaseDuration.isZero) {
            "Order search reconciliation lease duration must be positive"
        }

        val now = clock.instant()
        val leaseToken = UUID.randomUUID()
        val state =
            reconciliationStateRepository.tryAcquireLease(
                owner = owner,
                token = leaseToken,
                acquiredAt = now,
                expiresAt = now.plus(leaseDuration),
            ) ?: return OrderSearchProjectionReconciliationRunResult.LeaseUnavailable

        try {
            val batch = reconcileOrderSearchProjection.reconcile(state.cursor, batchSize)
            return if (batch.scannedCount == 0) {
                if (reconciliationStateRepository.complete(state.version, leaseToken, clock.instant())) {
                    OrderSearchProjectionReconciliationRunResult.Completed
                } else {
                    OrderSearchProjectionReconciliationRunResult.StateChanged
                }
            } else {
                val cursor = requireNotNull(batch.nextCursor) { "A non-empty reconciliation batch must have a cursor" }
                if (reconciliationStateRepository.advance(state.version, leaseToken, cursor, batch)) {
                    OrderSearchProjectionReconciliationRunResult.Advanced(batch)
                } else {
                    OrderSearchProjectionReconciliationRunResult.StateChanged
                }
            }
        } finally {
            reconciliationStateRepository.releaseLease(leaseToken)
        }
    }
}

sealed interface OrderSearchProjectionReconciliationRunResult {
    data class Advanced(
        val batch: OrderSearchProjectionReconciliationBatchResult,
    ) : OrderSearchProjectionReconciliationRunResult

    data object Completed : OrderSearchProjectionReconciliationRunResult

    data object StateChanged : OrderSearchProjectionReconciliationRunResult

    data object LeaseUnavailable : OrderSearchProjectionReconciliationRunResult
}
