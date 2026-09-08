package dev.pietrorussod.integrationhub.application.search

import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class RebuildOrderSearchIndexUseCase(
    private val readyOrderSearchDocumentReader: ReadyOrderSearchDocumentReader,
    private val reindexDocumentWriter: OrderSearchReindexDocumentWriter,
) {
    fun rebuild(
        candidateIndex: String,
        after: ReadyOrderSearchDocumentCursor?,
        batchSize: Int,
    ): OrderSearchReindexBatchResult {
        require(candidateIndex.isNotBlank()) { "Order search reindex candidate index must not be blank" }
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "Order search reindex batch size must be between 1 and $MAX_BATCH_SIZE"
        }

        val documents = readyOrderSearchDocumentReader.readPage(after, batchSize)
        val outcomes = documents.map { document -> reindexDocumentWriter.upsert(document, candidateIndex) }
        return OrderSearchReindexBatchResult.from(documents, outcomes)
    }

    private companion object {
        const val MAX_BATCH_SIZE = 500
    }
}

interface OrderSearchReindexDocumentWriter {
    fun upsert(
        document: OrderSearchDocument,
        candidateIndex: String,
    ): OrderSearchProjectionWriteOutcome
}

data class OrderSearchReindexBatchResult(
    val scannedCount: Int,
    val appliedCount: Int,
    val ignoredNonNewerVersionCount: Int,
    val nextCursor: ReadyOrderSearchDocumentCursor?,
) {
    init {
        require(listOf(scannedCount, appliedCount, ignoredNonNewerVersionCount).all { it >= 0 }) {
            "Order search reindex outcome counts must not be negative"
        }
        require(scannedCount == appliedCount + ignoredNonNewerVersionCount) {
            "Order search reindex outcome counts must equal the scanned count"
        }
        require((scannedCount == 0) == (nextCursor == null)) {
            "Order search reindex cursor must be present exactly when documents were scanned"
        }
    }

    fun toProgress(): OrderSearchReindexProgress =
        OrderSearchReindexProgress(
            scannedCount = scannedCount.toLong(),
            appliedCount = appliedCount.toLong(),
            ignoredNonNewerVersionCount = ignoredNonNewerVersionCount.toLong(),
        )

    companion object {
        internal fun from(
            documents: List<OrderSearchDocument>,
            outcomes: List<OrderSearchProjectionWriteOutcome>,
        ): OrderSearchReindexBatchResult {
            require(documents.size == outcomes.size) {
                "Order search reindex documents and outcomes must have the same size"
            }

            return OrderSearchReindexBatchResult(
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
