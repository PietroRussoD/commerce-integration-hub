package dev.pietrorussod.integrationhub.domain.order

import java.math.BigDecimal
import java.time.Instant

@ConsistentCopyVisibility
data class Order private constructor(
    val id: OrderId,
    val sourceSystem: SourceSystem,
    val externalOrderId: ExternalOrderId,
    val currency: Currency,
    val items: List<OrderItem>,
    val totalAmount: Money,
    val status: OrderStatus,
    val receivedAt: Instant,
) {
    companion object {
        private const val MAX_TOTAL_INTEGER_DIGITS = 17

        fun receive(
            id: OrderId,
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
            currency: Currency,
            items: List<OrderItem>,
            receivedAt: Instant,
        ): Order {
            val validatedItems = validateItems(currency, items)
            val totalAmount = calculateTotal(currency, validatedItems)

            return Order(
                id = id,
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                currency = currency,
                items = validatedItems,
                totalAmount = totalAmount,
                status = OrderStatus.RECEIVED,
                receivedAt = receivedAt,
            )
        }

        internal fun restore(
            id: OrderId,
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
            currency: Currency,
            items: List<OrderItem>,
            totalAmount: Money,
            status: OrderStatus,
            receivedAt: Instant,
        ): Order {
            val validatedItems = validateItems(currency, items)
            val calculatedTotal = calculateTotal(currency, validatedItems)
            require(totalAmount.currency == currency) { "Order total currency must match order currency" }
            require(totalAmount == calculatedTotal) { "Persisted order total must match its items" }

            return Order(
                id = id,
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                currency = currency,
                items = validatedItems,
                totalAmount = totalAmount,
                status = status,
                receivedAt = receivedAt,
            )
        }

        private fun validateItems(
            currency: Currency,
            items: List<OrderItem>,
        ): List<OrderItem> {
            val snapshot = items.toList()
            require(snapshot.isNotEmpty()) { "Order must contain at least one item" }
            require(snapshot.all { it.unitPrice.currency == currency && it.lineAmount.currency == currency }) {
                "Order item currency must match order currency"
            }
            require(snapshot.map { it.position } == snapshot.indices.toList()) {
                "Order item positions must be contiguous and start at zero"
            }
            require(snapshot.map { it.id }.distinct().size == snapshot.size) {
                "Order item ids must be unique"
            }

            val externalLineIds = snapshot.mapNotNull { it.externalLineId }
            require(externalLineIds.distinct().size == externalLineIds.size) {
                "External line ids must be unique within an order"
            }
            return snapshot
        }

        private fun calculateTotal(
            currency: Currency,
            items: List<OrderItem>,
        ): Money {
            val amount = items.fold(BigDecimal.ZERO) { total, item -> total.add(item.lineAmount.amount) }
            val normalized = amount.stripTrailingZeros()
            val integerDigits = (normalized.precision() - normalized.scale()).coerceAtLeast(0)
            require(integerDigits <= MAX_TOTAL_INTEGER_DIGITS) {
                "Order total exceeds the supported precision"
            }
            return Money.of(amount, currency)
        }
    }
}
