package dev.pietrorussod.integrationhub.application.search

import jakarta.enterprise.context.ApplicationScoped
import java.time.Clock

@ApplicationScoped
class RunOrderSearchProjectionReconciliationUseCase(
    private val reconciliationStateRepository: OrderSearchProjectionReconciliationStateRepository,
    private val reconcileOrderSearchProjection: ReconcileOrderSearchProjectionUseCase,
    private val clock: Clock,
) {
    fun run(batchSize: Int): OrderSearchProjectionReconciliationRunResult {
        val state = reconciliationStateRepository.current()
        val batch = reconcileOrderSearchProjection.reconcile(state.cursor, batchSize)

        return if (batch.scannedCount == 0) {
            if (reconciliationStateRepository.complete(state.version, clock.instant())) {
                OrderSearchProjectionReconciliationRunResult.Completed
            } else {
                OrderSearchProjectionReconciliationRunResult.StateChanged
            }
        } else {
            val cursor = requireNotNull(batch.nextCursor) { "A non-empty reconciliation batch must have a cursor" }
            if (reconciliationStateRepository.advance(state.version, cursor, batch)) {
                OrderSearchProjectionReconciliationRunResult.Advanced(batch)
            } else {
                OrderSearchProjectionReconciliationRunResult.StateChanged
            }
        }
    }
}

sealed interface OrderSearchProjectionReconciliationRunResult {
    data class Advanced(
        val batch: OrderSearchProjectionReconciliationBatchResult,
    ) : OrderSearchProjectionReconciliationRunResult

    data object Completed : OrderSearchProjectionReconciliationRunResult

    data object StateChanged : OrderSearchProjectionReconciliationRunResult
}
