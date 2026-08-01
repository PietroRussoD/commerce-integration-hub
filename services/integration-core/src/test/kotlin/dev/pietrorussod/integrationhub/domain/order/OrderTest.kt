package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class OrderTest {
    @Test
    fun `receives a new order`() {
        val orderId = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"))
        val sourceSystem = SourceSystem.from("marketplace-a")
        val externalOrderId = ExternalOrderId.from("order-1001")
        val receivedAt = Instant.parse("2026-07-31T06:30:00Z")

        val order =
            Order.receive(
                id = orderId,
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                receivedAt = receivedAt,
            )

        assertEquals(orderId, order.id)
        assertEquals(sourceSystem, order.sourceSystem)
        assertEquals(externalOrderId, order.externalOrderId)
        assertEquals(OrderStatus.RECEIVED, order.status)
        assertEquals(receivedAt, order.receivedAt)
    }
}
