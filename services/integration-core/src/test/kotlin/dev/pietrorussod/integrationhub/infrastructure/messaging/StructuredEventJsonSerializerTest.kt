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

class StructuredEventJsonSerializerTest {
    private val objectMapper = ObjectMapper()
    private val serializer = StructuredEventJsonSerializer(objectMapper)

    @Test
    fun `serializes a self-contained envelope with nested JSON payload`() {
        val event = outboundEvent("{\"orderId\":\"order-123\",\"currency\":\"EUR\"}")

        val serialized = serializer.serialize(event)
        val envelope = objectMapper.readTree(serialized)

        assertEquals(9, envelope.size())
        assertEquals(1, envelope["envelopeVersion"].intValue())
        assertEquals(event.eventId.toString(), envelope["eventId"].textValue())
        assertEquals("OrderReceived", envelope["eventType"].textValue())
        assertEquals(1, envelope["eventVersion"].intValue())
        assertEquals("ORDER", envelope["aggregateType"].textValue())
        assertEquals(event.aggregateId.toString(), envelope["aggregateId"].textValue())
        assertEquals(event.correlationId.toString(), envelope["correlationId"].textValue())
        assertEquals(event.occurredAt.toString(), envelope["occurredAt"].textValue())
        assertTrue(envelope["payload"].isObject)
        assertFalse(envelope["payload"].isTextual)
        assertEquals("order-123", envelope["payload"]["orderId"].textValue())
    }

    @Test
    fun `rejects malformed or non-object payloads`() {
        listOf("not-json", "null", "[]", "\"text\"").forEach { payload ->
            assertThrows(IllegalArgumentException::class.java) {
                serializer.serialize(outboundEvent(payload))
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
