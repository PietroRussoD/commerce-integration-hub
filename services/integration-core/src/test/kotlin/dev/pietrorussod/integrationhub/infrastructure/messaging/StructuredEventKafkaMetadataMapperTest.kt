package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.kafka.common.header.Headers
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID

class StructuredEventKafkaMetadataMapperTest {
    private val mapper =
        StructuredEventKafkaMetadataMapper(
            orderReceivedTopic = "integration.order.received.v1",
            orderReadyTopic = "integration.order.ready.v1",
        )

    @Test
    fun `derives the record key and routing headers from the structured event`() {
        val event = structuredEvent()

        val metadata = mapper.map(event)

        assertEquals("integration.order.received.v1", metadata.topic)
        assertEquals(event.aggregateId.toString(), metadata.key)
        assertEquals(5, metadata.headers.count())
        assertHeader(metadata.headers, "event-id", event.eventId.toString())
        assertHeader(metadata.headers, "event-type", event.eventType)
        assertHeader(metadata.headers, "event-version", event.eventVersion.toString())
        assertHeader(metadata.headers, "correlation-id", event.correlationId.toString())
        assertHeader(metadata.headers, "content-type", "application/json")
    }

    @Test
    fun `routes OrderReady version 1 to its dedicated topic`() {
        val metadata = mapper.map(structuredEvent().copy(eventType = "OrderReady"))

        assertEquals("integration.order.ready.v1", metadata.topic)
    }

    @Test
    fun `rejects an event without a configured route`() {
        val event = structuredEvent().copy(eventVersion = 2)

        assertThrows(IllegalArgumentException::class.java) {
            mapper.map(event)
        }
    }

    private fun assertHeader(
        headers: Headers,
        name: String,
        expectedValue: String,
    ) {
        val value = requireNotNull(headers.lastHeader(name)).value()
        assertEquals(expectedValue, String(value, StandardCharsets.UTF_8))
    }

    private fun structuredEvent(): StructuredEvent =
        StructuredEvent(
            envelopeVersion = 1,
            eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
            eventType = "OrderReceived",
            eventVersion = 1,
            aggregateType = "ORDER",
            aggregateId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            occurredAt = Instant.parse("2026-08-20T08:00:00Z"),
            payload = ObjectMapper().readTree("{\"orderId\":\"order-123\"}"),
        )
}
