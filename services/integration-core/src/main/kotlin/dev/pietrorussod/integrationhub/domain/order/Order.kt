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
    val aggregateVersion: Long,
    val receivedAt: Instant,
) {
    init {
        require(aggregateVersion > 0) { "Order aggregate version must be positive" }
    }

    fun startProcessing(): Order {
        check(status == OrderStatus.RECEIVED) {
            "Order processing can only start from RECEIVED status"
        }
        return copy(status = OrderStatus.PROCESSING, aggregateVersion = nextAggregateVersion())
    }

    fun markReady(): Order {
        check(status == OrderStatus.PROCESSING) {
            "An order can only become ready from PROCESSING status"
        }
        return copy(status = OrderStatus.READY, aggregateVersion = nextAggregateVersion())
    }

    companion object {
        private const val MAX_TOTAL_INTEGER_DIGITS = 17

        fun receive(
            id: OrderId,
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
            currency: Currency,
            items: List<OrderItem>,
            declaredTotalAmount: Money,
            receivedAt: Instant,
        ): Order {
            val validatedItems = validateItems(currency, items)
            val totalAmount = calculateTotal(currency, validatedItems)
            validateDeclaredTotal(currency, declaredTotalAmount, totalAmount)

            return Order(
                id = id,
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                currency = currency,
                items = validatedItems,
                totalAmount = totalAmount,
                status = OrderStatus.RECEIVED,
                aggregateVersion = INITIAL_AGGREGATE_VERSION,
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
            aggregateVersion: Long,
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
                aggregateVersion = aggregateVersion,
                receivedAt = receivedAt,
            )
        }

        private const val INITIAL_AGGREGATE_VERSION = 1L

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

        private fun validateDeclaredTotal(
            currency: Currency,
            declaredTotalAmount: Money,
            calculatedTotalAmount: Money,
        ) {
            require(declaredTotalAmount.currency == currency) {
                "Declared total currency must match order currency"
            }
            require(declaredTotalAmount.amount >= BigDecimal.ZERO) {
                "Declared total amount must not be negative"
            }
            require(declaredTotalAmount.amount.scale().coerceAtLeast(0) <= currency.minorUnitDigits) {
                "Declared total amount must have at most ${currency.minorUnitDigits} fractional digits"
            }
            require(declaredTotalAmount == calculatedTotalAmount) {
                "Declared total amount must match the calculated order total"
            }
        }
    }

    private fun nextAggregateVersion(): Long =
        try {
            Math.addExact(aggregateVersion, 1)
        } catch (exception: ArithmeticException) {
            throw IllegalStateException("Order aggregate version cannot be incremented", exception)
        }
}
