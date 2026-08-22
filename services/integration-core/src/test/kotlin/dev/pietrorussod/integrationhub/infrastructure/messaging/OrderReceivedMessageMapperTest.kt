package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class OrderReceivedMessageMapperTest {
    private val objectMapper = ObjectMapper().findAndRegisterModules()
    private val mapper = OrderReceivedMessageMapper()
    private val orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")

    @Test
    fun `maps a supported OrderReceived event`() {
        val event = event()

        val command = mapper.map(event)

        assertEquals(event.eventId, command.eventId)
        assertEquals(orderId, command.orderId.value)
        assertEquals(event.correlationId, command.correlationId)
    }

    @Test
    fun `maps the complete canonical payload produced by ingestion`() {
        val payload =
            objectMapper.readTree(
                """
                {
                  "orderId": "$orderId",
                  "sourceSystem": "MARKETPLACE_A",
                  "externalOrderId": "ORDER-1",
                  "currency": "EUR",
                  "totalAmount": 19.99,
                  "status": "RECEIVED",
                  "items": [{"sku": "SKU-1", "quantity": 1, "unitPrice": 19.99}]
                }
                """.trimIndent(),
            )

        val command = mapper.map(event().copy(payload = payload))

        assertEquals(orderId, command.orderId.value)
    }

    @Test
    fun `rejects an unsupported envelope version`() {
        assertThrows(InvalidOrderReceivedEventException::class.java) {
            mapper.map(event(envelopeVersion = 2))
        }
    }

    @Test
    fun `rejects an unsupported event contract`() {
        listOf(
            eventType("OrderReady"),
            eventVersion(2),
            aggregateType("CUSTOMER"),
        ).forEach { event ->
            assertThrows(InvalidOrderReceivedEventException::class.java) { mapper.map(event) }
        }
    }

    @Test
    fun `rejects an aggregate ID that differs from the payload order ID`() {
        val differentOrderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53")

        assertThrows(InvalidOrderReceivedEventException::class.java) {
            mapper.map(event(payloadOrderId = differentOrderId))
        }
    }

    @Test
    fun `rejects a malformed payload`() {
        listOf(
            objectMapper.createArrayNode(),
            objectMapper.createObjectNode(),
            objectMapper.createObjectNode().put("orderId", "not-a-uuid"),
        ).forEach { payload ->
            assertThrows(InvalidOrderReceivedEventException::class.java) {
                mapper.map(event().copy(payload = payload))
            }
        }
    }

    private fun event(
        envelopeVersion: Int = 1,
        payloadOrderId: UUID = orderId,
    ): StructuredEvent =
        StructuredEvent(
            envelopeVersion = envelopeVersion,
            eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
            eventType = "OrderReceived",
            eventVersion = 1,
            aggregateType = "ORDER",
            aggregateId = orderId,
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            occurredAt = Instant.parse("2026-08-21T08:00:00Z"),
            payload = objectMapper.createObjectNode().put("orderId", payloadOrderId.toString()),
        )

    private fun eventType(value: String): StructuredEvent = event().copy(eventType = value)

    private fun eventVersion(value: Int): StructuredEvent = event().copy(eventVersion = value)

    private fun aggregateType(value: String): StructuredEvent = event().copy(aggregateType = value)
}
