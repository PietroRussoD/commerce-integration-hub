package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.time.Instant

data class SearchOrdersQuery(
    val text: String?,
    val sourceSystem: SourceSystem?,
    val externalOrderId: ExternalOrderId?,
    val status: OrderStatus?,
    val currency: Currency?,
    val sku: String?,
    val receivedAtFrom: Instant?,
    val receivedAtBefore: Instant?,
    val limit: Int,
    val offset: Int,
) {
    init {
        validateOptionalText(text, "Search text", MAX_SEARCH_TEXT_LENGTH)
        validateOptionalText(sku, "SKU", MAX_SKU_LENGTH)
        require(receivedAtFrom == null || receivedAtBefore == null || receivedAtFrom < receivedAtBefore) {
            "Order search receipt start must precede its exclusive end"
        }
        require(limit in 1..MAX_PAGE_SIZE) { "Order search page size must be between 1 and $MAX_PAGE_SIZE" }
        require(offset >= 0) { "Order search offset must not be negative" }
        require(offset.toLong() + limit <= MAX_RESULT_WINDOW) {
            "Order search offset and page size must not exceed $MAX_RESULT_WINDOW"
        }
    }

    companion object {
        const val MAX_PAGE_SIZE = 100
        const val MAX_RESULT_WINDOW = 10_000
        const val MAX_SEARCH_TEXT_LENGTH = 200
        const val MAX_SKU_LENGTH = 100

        private fun validateOptionalText(
            value: String?,
            fieldName: String,
            maxLength: Int,
        ) {
            require(value == null || value.isNotBlank()) { "$fieldName must not be blank" }
            require(value == null || value == value.trim()) { "$fieldName must not contain surrounding whitespace" }
            require(value == null || value.length <= maxLength) { "$fieldName must not exceed $maxLength characters" }
        }
    }
}
