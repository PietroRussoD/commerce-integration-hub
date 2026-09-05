package dev.pietrorussod.integrationhub.application.outbox

import dev.pietrorussod.integrationhub.application.processing.OrderReadyEvent
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

class PendingOutboxEventTest {
    private val readyAt = Instant.parse("2026-08-21T08:00:02Z")

    @Test
    fun `creates a versioned pending event from an OrderReady event`() {
        val source = orderReadyEvent()
        val payload = """{"orderId":"${source.order.id.value}"}"""

        val pendingEvent = PendingOutboxEvent.orderReady(source, payload)

        assertEquals(source.id, pendingEvent.id)
        assertEquals("ORDER", pendingEvent.aggregateType)
        assertEquals(source.order.id.value, pendingEvent.aggregateId)
        assertEquals("OrderReady", pendingEvent.eventType)
        assertEquals(2, pendingEvent.eventVersion)
        assertEquals(payload, pendingEvent.payload)
        assertEquals(source.correlationId, pendingEvent.correlationId)
        assertEquals(source.occurredAt, pendingEvent.createdAt)
    }

    @Test
    fun `rejects a blank OrderReady payload`() {
        assertThrows(IllegalArgumentException::class.java) {
            PendingOutboxEvent.orderReady(orderReadyEvent(), "   ")
        }
    }

    private fun orderReadyEvent(): OrderReadyEvent {
        val currency = Currency.EUR
        val item =
            OrderItem.create(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53"),
                externalLineId = "line-1",
                sku = "SKU-1",
                description = "Test item",
                quantity = BigDecimal.ONE,
                unitPrice = Money.of(BigDecimal("19.99"), currency),
                position = 0,
            )
        val order =
            Order
                .receive(
                    id = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")),
                    sourceSystem = SourceSystem.from("marketplace-a"),
                    externalOrderId = ExternalOrderId.from("order-1001"),
                    currency = currency,
                    items = listOf(item),
                    declaredTotalAmount = Money.of(BigDecimal("19.99"), currency),
                    receivedAt = readyAt.minusSeconds(2),
                ).startProcessing()
                .markReady()
        return OrderReadyEvent(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f54"),
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            order = order,
            occurredAt = readyAt,
        )
    }
}
