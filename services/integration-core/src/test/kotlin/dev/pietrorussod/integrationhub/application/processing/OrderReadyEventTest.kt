package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class OrderReadyEventTest {
    private val receivedAt = Instant.parse("2026-08-21T08:00:00Z")
    private val readyAt = receivedAt.plusSeconds(2)

    @Test
    fun `creates an event for a ready order`() {
        val readyOrder = receivedOrder().startProcessing().markReady()

        val event =
            OrderReadyEvent(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f54"),
                correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
                order = readyOrder,
                occurredAt = readyAt,
            )

        assertEquals(readyOrder, event.order)
        assertEquals(readyAt, event.occurredAt)
    }

    @Test
    fun `rejects an event for an order that is not ready`() {
        assertThrows(IllegalArgumentException::class.java) {
            OrderReadyEvent(
                id = UUID.randomUUID(),
                correlationId = UUID.randomUUID(),
                order = receivedOrder(),
                occurredAt = readyAt,
            )
        }
    }

    @Test
    fun `rejects an event before the order was received`() {
        assertThrows(IllegalArgumentException::class.java) {
            OrderReadyEvent(
                id = UUID.randomUUID(),
                correlationId = UUID.randomUUID(),
                order = receivedOrder().startProcessing().markReady(),
                occurredAt = receivedAt.minusNanos(1),
            )
        }
    }

    private fun receivedOrder(): Order {
        val currency = Currency.EUR
        val item =
            OrderItem.create(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53"),
                externalLineId = "line-1",
                sku = "SKU-1",
                description = "Test item",
                quantity = BigDecimal.ONE,
                unitPrice = Money.of(BigDecimal("10.00"), currency),
                position = 0,
            )
        return Order.receive(
            id = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")),
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = ExternalOrderId.from("order-1001"),
            currency = currency,
            items = listOf(item),
            declaredTotalAmount = Money.of(BigDecimal("10.00"), currency),
            receivedAt = receivedAt,
        )
    }
}
