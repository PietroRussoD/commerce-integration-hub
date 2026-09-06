package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class OrderSearchDocument(
    val orderId: UUID,
    val aggregateVersion: Long,
    val sourceSystem: SourceSystem,
    val externalOrderId: String,
    val status: OrderStatus,
    val currency: Currency,
    val totalAmount: BigDecimal,
    val receivedAt: Instant,
    val readyAt: Instant,
    val items: List<OrderSearchItem>,
) {
    init {
        require(aggregateVersion > 0) { "Order search aggregate version must be positive" }
        require(externalOrderId.isNotBlank()) { "Order search external order ID must not be blank" }
        require(totalAmount.signum() >= 0) { "Order search total amount must not be negative" }
        require(items.isNotEmpty()) { "Order search document must contain at least one item" }
        require(!readyAt.isBefore(receivedAt)) { "Order search ready time must not precede receipt" }
    }
}

data class OrderSearchItem(
    val sku: String,
    val description: String?,
    val quantity: BigDecimal,
    val unitPrice: BigDecimal,
    val lineAmount: BigDecimal,
    val position: Int,
) {
    init {
        require(sku.isNotBlank()) { "Order search item SKU must not be blank" }
        require(quantity.signum() > 0) { "Order search item quantity must be positive" }
        require(unitPrice.signum() >= 0) { "Order search item unit price must not be negative" }
        require(lineAmount.signum() >= 0) { "Order search item line amount must not be negative" }
        require(position >= 0) { "Order search item position must not be negative" }
    }
}
