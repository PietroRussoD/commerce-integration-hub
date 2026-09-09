package dev.pietrorussod.integrationhub.application.search

class ValidateOrderSearchReindexUseCase(
    private val authoritativeDocumentCounter: ReadyOrderSearchDocumentCounter,
    private val candidateDocumentCounter: OrderSearchReindexDocumentCounter,
) {
    fun validate(candidateIndex: String): OrderSearchReindexValidationResult {
        require(candidateIndex.isNotBlank()) { "Order search reindex candidate index must not be blank" }

        val authoritativeDocumentCount = authoritativeDocumentCounter.countReadyDocuments()
        val candidateDocumentCount = candidateDocumentCounter.countDocuments(candidateIndex)
        return OrderSearchReindexValidationResult(
            authoritativeDocumentCount = authoritativeDocumentCount,
            candidateDocumentCount = candidateDocumentCount,
        )
    }
}

fun interface ReadyOrderSearchDocumentCounter {
    fun countReadyDocuments(): Long
}

fun interface OrderSearchReindexDocumentCounter {
    fun countDocuments(candidateIndex: String): Long
}

data class OrderSearchReindexValidationResult(
    val authoritativeDocumentCount: Long,
    val candidateDocumentCount: Long,
) {
    init {
        require(authoritativeDocumentCount >= 0) { "Authoritative order search document count must not be negative" }
        require(candidateDocumentCount >= 0) { "Candidate order search document count must not be negative" }
    }

    val isValid: Boolean
        get() = authoritativeDocumentCount == candidateDocumentCount
}
