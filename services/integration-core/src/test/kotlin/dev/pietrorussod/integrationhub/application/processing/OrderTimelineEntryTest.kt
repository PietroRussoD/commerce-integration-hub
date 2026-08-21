package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class OrderTimelineEntryTest {
    private val orderId = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"))
    private val correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55")
    private val occurredAt = Instant.parse("2026-08-21T08:00:00Z")

    @Test
    fun `records the start of order processing`() {
        val entry = OrderTimelineEntry.processingStarted(UUID.randomUUID(), orderId, correlationId, occurredAt)

        assertEquals(OrderTimelineEventType.PROCESSING_STARTED, entry.eventType)
        assertEquals(OrderStatus.RECEIVED, entry.fromStatus)
        assertEquals(OrderStatus.PROCESSING, entry.toStatus)
        assertEquals(orderId, entry.orderId)
        assertEquals(correlationId, entry.correlationId)
        assertEquals(occurredAt, entry.occurredAt)
    }

    @Test
    fun `records successful order processing`() {
        val entry = OrderTimelineEntry.processingSucceeded(UUID.randomUUID(), orderId, correlationId, occurredAt)

        assertEquals(OrderTimelineEventType.PROCESSING_SUCCEEDED, entry.eventType)
        assertEquals(OrderStatus.PROCESSING, entry.fromStatus)
        assertEquals(OrderStatus.READY, entry.toStatus)
    }
}
