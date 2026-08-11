package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class OrderTest {
    @Test
    fun `receives a new order`() {
        val orderId = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"))
        val sourceSystem = SourceSystem.from("marketplace-a")
        val externalOrderId = ExternalOrderId.from("order-1001")
        val receivedAt = Instant.parse("2026-07-31T06:30:00Z")
        val items = listOf(item(position = 0, unitPrice = "19.99", quantity = "2"))

        val order =
            Order.receive(
                id = orderId,
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                currency = Currency.EUR,
                items = items,
                receivedAt = receivedAt,
            )

        assertEquals(orderId, order.id)
        assertEquals(sourceSystem, order.sourceSystem)
        assertEquals(externalOrderId, order.externalOrderId)
        assertEquals(Currency.EUR, order.currency)
        assertEquals(OrderStatus.RECEIVED, order.status)
        assertEquals(items, order.items)
        assertEquals(Money.of(BigDecimal("39.98"), Currency.EUR), order.totalAmount)
        assertEquals(receivedAt, order.receivedAt)
    }

    @Test
    fun `calculates the total from rounded line amounts`() {
        val order =
            receiveOrder(
                listOf(
                    item(position = 0, unitPrice = "0.335"),
                    item(position = 1, unitPrice = "0.335"),
                ),
            )

        assertEquals(Money.of(BigDecimal("0.68"), Currency.EUR), order.totalAmount)
    }

    @Test
    fun `rejects an order without items`() {
        assertThrows(IllegalArgumentException::class.java) { receiveOrder(emptyList()) }
    }

    @Test
    fun `rejects non-contiguous item positions`() {
        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(listOf(item(position = 1)))
        }
    }

    private fun receiveOrder(items: List<OrderItem>): Order =
        Order.receive(
            id = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")),
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = ExternalOrderId.from("order-1001"),
            currency = Currency.EUR,
            items = items,
            receivedAt = Instant.parse("2026-07-31T06:30:00Z"),
        )

    private fun item(
        position: Int,
        unitPrice: String = "10.00",
        quantity: String = "1",
    ): OrderItem =
        OrderItem.create(
            id = UUID.nameUUIDFromBytes("item-$position".toByteArray()),
            externalLineId = "line-$position",
            sku = "SKU-$position",
            description = null,
            quantity = BigDecimal(quantity),
            unitPrice = Money.of(BigDecimal(unitPrice), Currency.EUR),
            position = position,
        )
}
