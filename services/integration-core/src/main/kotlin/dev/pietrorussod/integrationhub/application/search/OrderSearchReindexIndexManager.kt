package dev.pietrorussod.integrationhub.application.search

interface OrderSearchReindexIndexManager {
    fun planCandidate(): OrderSearchReindexIndices

    fun createCandidate(candidateIndex: String)

    fun cutOver(indices: OrderSearchReindexIndices): OrderSearchReindexCutoverOutcome
}

data class OrderSearchReindexIndices(
    val sourceIndex: String,
    val candidateIndex: String,
) {
    init {
        require(sourceIndex.isNotBlank()) { "Order search reindex source index must not be blank" }
        require(candidateIndex.isNotBlank()) { "Order search reindex candidate index must not be blank" }
        require(sourceIndex != candidateIndex) { "Order search reindex indices must differ" }
    }
}

enum class OrderSearchReindexCutoverOutcome {
    CUT_OVER,
    ALREADY_CUT_OVER,
}
