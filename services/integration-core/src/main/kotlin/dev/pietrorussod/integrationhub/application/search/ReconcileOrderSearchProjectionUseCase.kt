package dev.pietrorussod.integrationhub.application.search

import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class ReconcileOrderSearchProjectionUseCase(
    private val readyOrderSearchDocumentReader: ReadyOrderSearchDocumentReader,
    private val projection: OrderSearchProjection,
) {
    fun reconcile(
        after: ReadyOrderSearchDocumentCursor?,
        batchSize: Int,
    ): OrderSearchProjectionReconciliationBatchResult {
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "Order search reconciliation batch size must be between 1 and $MAX_BATCH_SIZE"
        }

        val documents = readyOrderSearchDocumentReader.readPage(after, batchSize)
        val outcomes = documents.map(projection::upsert)
        return OrderSearchProjectionReconciliationBatchResult.from(documents, outcomes)
    }

    private companion object {
        const val MAX_BATCH_SIZE = 500
    }
}

data class OrderSearchProjectionReconciliationBatchResult(
    val scannedCount: Int,
    val appliedCount: Int,
    val ignoredNonNewerVersionCount: Int,
    val nextCursor: ReadyOrderSearchDocumentCursor?,
) {
    init {
        require(listOf(scannedCount, appliedCount, ignoredNonNewerVersionCount).all { it >= 0 }) {
            "Order search reconciliation outcome counts must not be negative"
        }
        require(scannedCount == appliedCount + ignoredNonNewerVersionCount) {
            "Order search reconciliation outcome counts must equal the scanned count"
        }
        require((scannedCount == 0) == (nextCursor == null)) {
            "Order search reconciliation cursor must be present exactly when documents were scanned"
        }
    }

    companion object {
        internal fun from(
            documents: List<OrderSearchDocument>,
            outcomes: List<OrderSearchProjectionWriteOutcome>,
        ): OrderSearchProjectionReconciliationBatchResult {
            require(documents.size == outcomes.size) {
                "Order search reconciliation documents and outcomes must have the same size"
            }

            return OrderSearchProjectionReconciliationBatchResult(
                scannedCount = documents.size,
                appliedCount = outcomes.count { it == OrderSearchProjectionWriteOutcome.APPLIED },
                ignoredNonNewerVersionCount =
                    outcomes.count { it == OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION },
                nextCursor =
                    documents.lastOrNull()?.let { document ->
                        ReadyOrderSearchDocumentCursor(document.receivedAt, document.orderId)
                    },
            )
        }
    }
}
