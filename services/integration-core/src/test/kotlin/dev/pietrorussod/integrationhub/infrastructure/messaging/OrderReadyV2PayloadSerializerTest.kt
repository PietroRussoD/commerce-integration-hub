package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.databind.SerializationFeature
import dev.pietrorussod.integrationhub.application.processing.OrderReadyEvent
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class OrderReadyV2PayloadSerializerTest {
    private val objectMapper =
        ObjectMapper()
            .findAndRegisterModules()
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
    private val serializer = OrderReadyV2PayloadSerializer(objectMapper)
    private val receivedAt = Instant.parse("2026-08-21T08:00:00Z")
    private val readyAt = receivedAt.plusSeconds(2)

    @Test
    fun `serializes a self-contained ready order payload with its aggregate version`() {
        val event = readyEvent()

        val payload = objectMapper.readTree(serializer.serialize(event))

        assertEquals(10, payload.size())
        assertEquals(
            event.order.id.value
                .toString(),
            payload["orderId"].textValue(),
        )
        assertEquals(3, payload["aggregateVersion"].longValue())
        assertEquals("marketplace-a", payload["sourceSystem"].textValue())
        assertEquals("order-1001", payload["externalOrderId"].textValue())
        assertEquals("EUR", payload["currency"].textValue())
        assertEquals(0, payload["totalAmount"].decimalValue().compareTo(BigDecimal("19.99")))
        assertEquals("READY", payload["status"].textValue())
        assertEquals(receivedAt.toString(), payload["receivedAt"].textValue())
        assertEquals(readyAt.toString(), payload["readyAt"].textValue())

        val item = payload["items"].single()
        assertEquals(7, item.size())
        assertEquals("line-1", item["externalLineId"].textValue())
        assertEquals("SKU-1", item["sku"].textValue())
        assertEquals("Test item", item["description"].textValue())
        assertEquals(0, item["quantity"].decimalValue().compareTo(BigDecimal.ONE))
        assertEquals(0, item["unitPrice"].decimalValue().compareTo(BigDecimal("19.99")))
        assertEquals(0, item["lineAmount"].decimalValue().compareTo(BigDecimal("19.99")))
        assertEquals(0, item["position"].intValue())
        assertTrue(payload["items"].isArray)
    }

    private fun readyEvent(): OrderReadyEvent {
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
                    receivedAt = receivedAt,
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
