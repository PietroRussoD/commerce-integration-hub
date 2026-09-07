package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class OrderReadyMessageMapperTest {
    private val objectMapper =
        ObjectMapper()
            .findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val mapper = OrderReadyMessageMapper(objectMapper)
    private val orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
    private val readyAt = Instant.parse("2026-09-07T08:01:00Z")

    @Test
    fun `maps a supported OrderReady v2 event`() {
        val document = mapper.map(event())

        assertEquals(orderId, document.orderId)
        assertEquals(3, document.aggregateVersion)
        assertEquals("marketplace-a", document.sourceSystem.value)
        assertEquals("order-1001", document.externalOrderId)
        assertEquals(OrderStatus.READY, document.status)
        assertEquals("EUR", document.currency.name)
        assertEquals(0, document.totalAmount.compareTo(BigDecimal("39.98")))
        assertEquals(Instant.parse("2026-09-07T08:00:00Z"), document.receivedAt)
        assertEquals(readyAt, document.readyAt)

        val item = document.items.single()
        assertEquals("SKU-1", item.sku)
        assertEquals("Searchable item", item.description)
        assertEquals(0, item.quantity.compareTo(BigDecimal("2")))
        assertEquals(0, item.unitPrice.compareTo(BigDecimal("19.99")))
        assertEquals(0, item.lineAmount.compareTo(BigDecimal("39.98")))
        assertEquals(0, item.position)
    }

    @Test
    fun `rejects an unsupported event contract`() {
        listOf(
            event().copy(envelopeVersion = 2),
            event().copy(eventType = "OrderReceived"),
            event().copy(eventVersion = 1),
            event().copy(aggregateType = "CUSTOMER"),
        ).forEach { invalidEvent ->
            assertThrows(InvalidOrderReadyEventException::class.java) {
                mapper.map(invalidEvent)
            }
        }
    }

    @Test
    fun `rejects inconsistent aggregate and payload data`() {
        val differentOrderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53")
        val wrongOrder = event().copy(aggregateId = differentOrderId)
        val wrongTime = event().copy(occurredAt = readyAt.plusSeconds(1))
        val wrongStatus = event(status = "PROCESSING")

        listOf(wrongOrder, wrongTime, wrongStatus).forEach { invalidEvent ->
            assertThrows(InvalidOrderReadyEventException::class.java) {
                mapper.map(invalidEvent)
            }
        }
    }

    private fun event(status: String = "READY"): StructuredEvent =
        StructuredEvent(
            envelopeVersion = 1,
            eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f54"),
            eventType = "OrderReady",
            eventVersion = 2,
            aggregateType = "ORDER",
            aggregateId = orderId,
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            occurredAt = readyAt,
            payload =
                objectMapper.valueToTree(
                    OrderReadyV2Payload(
                        orderId = orderId,
                        aggregateVersion = 3,
                        sourceSystem = "marketplace-a",
                        externalOrderId = "order-1001",
                        currency = "EUR",
                        totalAmount = BigDecimal("39.98"),
                        status = status,
                        receivedAt = Instant.parse("2026-09-07T08:00:00Z"),
                        readyAt = readyAt,
                        items =
                            listOf(
                                OrderReadyV2ItemPayload(
                                    externalLineId = "line-1",
                                    sku = "SKU-1",
                                    description = "Searchable item",
                                    quantity = BigDecimal("2"),
                                    unitPrice = BigDecimal("19.99"),
                                    lineAmount = BigDecimal("39.98"),
                                    position = 0,
                                ),
                            ),
                    ),
                ),
        )
}
