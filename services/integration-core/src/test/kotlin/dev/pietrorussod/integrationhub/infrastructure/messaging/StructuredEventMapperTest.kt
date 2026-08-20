package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class StructuredEventMapperTest {
    private val objectMapper = ObjectMapper().findAndRegisterModules()
    private val mapper = StructuredEventMapper(objectMapper)

    @Test
    fun `maps a self-contained event with nested JSON payload`() {
        val source = outboundEvent("{\"orderId\":\"order-123\",\"currency\":\"EUR\"}")

        val event = mapper.map(source)

        assertEquals(source.envelopeVersion, event.envelopeVersion)
        assertEquals(source.eventId, event.eventId)
        assertEquals(source.eventType, event.eventType)
        assertEquals(source.eventVersion, event.eventVersion)
        assertEquals(source.aggregateType, event.aggregateType)
        assertEquals(source.aggregateId, event.aggregateId)
        assertEquals(source.correlationId, event.correlationId)
        assertEquals(source.occurredAt, event.occurredAt)
        assertTrue(event.payload.isObject)
        assertFalse(event.payload.isTextual)
        assertEquals("order-123", event.payload["orderId"].textValue())
    }

    @Test
    fun `keeps the expected contract when Jackson serializes the event`() {
        val event = mapper.map(outboundEvent("{\"orderId\":\"order-123\"}"))

        val envelope = objectMapper.readTree(objectMapper.writeValueAsBytes(event))

        assertEquals(9, envelope.size())
        assertEquals(event.eventId.toString(), envelope["eventId"].textValue())
        assertEquals(event.aggregateId.toString(), envelope["aggregateId"].textValue())
        assertEquals(event.correlationId.toString(), envelope["correlationId"].textValue())
        assertEquals(event.occurredAt.toString(), envelope["occurredAt"].textValue())
        assertTrue(envelope["payload"].isObject)
        assertFalse(envelope["payload"].isTextual)
    }

    @Test
    fun `rejects malformed or non-object payloads`() {
        listOf("not-json", "null", "[]", "\"text\"").forEach { payload ->
            assertThrows(IllegalArgumentException::class.java) {
                mapper.map(outboundEvent(payload))
            }
        }
    }

    private fun outboundEvent(payload: String): OutboundIntegrationEvent =
        OutboundIntegrationEvent(
            envelopeVersion = 1,
            eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
            eventType = "OrderReceived",
            eventVersion = 1,
            aggregateType = "ORDER",
            aggregateId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            occurredAt = Instant.parse("2026-08-20T08:00:00Z"),
            payload = payload,
        )
}
