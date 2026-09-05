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
                declaredTotalAmount = Money.of(BigDecimal("39.98"), Currency.EUR),
                receivedAt = receivedAt,
            )

        assertEquals(orderId, order.id)
        assertEquals(sourceSystem, order.sourceSystem)
        assertEquals(externalOrderId, order.externalOrderId)
        assertEquals(Currency.EUR, order.currency)
        assertEquals(OrderStatus.RECEIVED, order.status)
        assertEquals(1, order.aggregateVersion)
        assertEquals(items, order.items)
        assertEquals(Money.of(BigDecimal("39.98"), Currency.EUR), order.totalAmount)
        assertEquals(receivedAt, order.receivedAt)
    }

    @Test
    fun `moves a received order through processing to ready`() {
        val processingOrder = receiveOrder(listOf(item(position = 0))).startProcessing()

        val readyOrder = processingOrder.markReady()

        assertEquals(OrderStatus.PROCESSING, processingOrder.status)
        assertEquals(2, processingOrder.aggregateVersion)
        assertEquals(OrderStatus.READY, readyOrder.status)
        assertEquals(3, readyOrder.aggregateVersion)
    }

    @Test
    fun `rejects becoming ready before processing starts`() {
        val receivedOrder = receiveOrder(listOf(item(position = 0)))

        assertThrows(IllegalStateException::class.java) { receivedOrder.markReady() }
    }

    @Test
    fun `rejects starting processing more than once`() {
        val processingOrder = receiveOrder(listOf(item(position = 0))).startProcessing()

        assertThrows(IllegalStateException::class.java) { processingOrder.startProcessing() }
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

    @Test
    fun `rejects an item with a different currency`() {
        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(listOf(item(position = 0, currency = Currency.USD)))
        }
    }

    @Test
    fun `rejects duplicate item ids`() {
        val itemId = UUID.nameUUIDFromBytes("duplicate-item".toByteArray())

        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(
                listOf(
                    item(position = 0, id = itemId),
                    item(position = 1, id = itemId),
                ),
            )
        }
    }

    @Test
    fun `rejects duplicate external line ids`() {
        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(
                listOf(
                    item(position = 0, externalLineId = "line-1"),
                    item(position = 1, externalLineId = "line-1"),
                ),
            )
        }
    }

    @Test
    fun `rejects a declared total that differs from the rounded line total`() {
        val items =
            listOf(
                item(position = 0, unitPrice = "0.335"),
                item(position = 1, unitPrice = "0.335"),
            )

        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(
                items = items,
                declaredTotalAmount = Money.of(BigDecimal("0.67"), Currency.EUR),
            )
        }
    }

    @Test
    fun `rejects a declared total with more than the currency fractional digits`() {
        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(
                items = listOf(item(position = 0)),
                declaredTotalAmount = Money.of(BigDecimal("10.001"), Currency.EUR),
            )
        }
    }

    @Test
    fun `rejects a negative declared total`() {
        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(
                items = listOf(item(position = 0)),
                declaredTotalAmount = Money.of(BigDecimal("-10.00"), Currency.EUR),
            )
        }
    }

    @Test
    fun `rejects a declared total with a different currency`() {
        assertThrows(IllegalArgumentException::class.java) {
            receiveOrder(
                items = listOf(item(position = 0)),
                declaredTotalAmount = Money.of(BigDecimal("10.00"), Currency.USD),
            )
        }
    }

    private fun receiveOrder(
        items: List<OrderItem>,
        declaredTotalAmount: Money =
            Money.of(
                items.fold(BigDecimal.ZERO) { total, item -> total.add(item.lineAmount.amount) },
                Currency.EUR,
            ),
    ): Order =
        Order.receive(
            id = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")),
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = ExternalOrderId.from("order-1001"),
            currency = Currency.EUR,
            items = items,
            declaredTotalAmount = declaredTotalAmount,
            receivedAt = Instant.parse("2026-07-31T06:30:00Z"),
        )

    private fun item(
        position: Int,
        unitPrice: String = "10.00",
        quantity: String = "1",
        id: UUID = UUID.nameUUIDFromBytes("item-$position".toByteArray()),
        externalLineId: String = "line-$position",
        currency: Currency = Currency.EUR,
    ): OrderItem =
        OrderItem.create(
            id = id,
            externalLineId = externalLineId,
            sku = "SKU-$position",
            description = null,
            quantity = BigDecimal(quantity),
            unitPrice = Money.of(BigDecimal(unitPrice), currency),
            position = position,
        )
}
