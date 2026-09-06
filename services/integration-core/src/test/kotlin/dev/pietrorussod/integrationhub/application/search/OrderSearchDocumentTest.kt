package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class OrderSearchDocumentTest {
    private val receivedAt = Instant.parse("2026-09-06T08:00:00Z")
    private val readyAt = receivedAt.plusSeconds(2)

    @Test
    fun `rejects an order document without a positive aggregate version`() {
        assertThrows(IllegalArgumentException::class.java) {
            document(aggregateVersion = 0)
        }
    }

    @Test
    fun `rejects an item without a positive quantity`() {
        assertThrows(IllegalArgumentException::class.java) {
            OrderSearchItem(
                sku = "SKU-1",
                description = "Test item",
                quantity = BigDecimal.ZERO,
                unitPrice = BigDecimal("19.99"),
                lineAmount = BigDecimal("19.99"),
                position = 0,
            )
        }
    }

    @Test
    fun `rejects a ready time before receipt`() {
        assertThrows(IllegalArgumentException::class.java) {
            document(readyAt = receivedAt.minusSeconds(1))
        }
    }

    private fun document(
        aggregateVersion: Long = 3,
        readyAt: Instant = this.readyAt,
    ): OrderSearchDocument =
        OrderSearchDocument(
            orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            aggregateVersion = aggregateVersion,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = "order-1001",
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("19.99"),
            receivedAt = receivedAt,
            readyAt = readyAt,
            items =
                listOf(
                    OrderSearchItem(
                        sku = "SKU-1",
                        description = "Test item",
                        quantity = BigDecimal.ONE,
                        unitPrice = BigDecimal("19.99"),
                        lineAmount = BigDecimal("19.99"),
                        position = 0,
                    ),
                ),
        )
}
