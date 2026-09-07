package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.node.JsonNodeFactory
import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchItem
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjection
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import io.quarkus.test.InjectMock
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@QuarkusTest
class OrderReadySearchProjectionKafkaConsumerRetryIT {
    @Inject
    lateinit var consumer: OrderReadySearchProjectionKafkaConsumer

    @InjectMock
    lateinit var messageMapper: OrderReadyMessageMapper

    @InjectMock
    lateinit var projection: OrderSearchProjection

    @Test
    fun `retries transient projection failures and eventually succeeds`() {
        val event = event()
        val document = document(event.aggregateId)
        var invocationCount = 0
        Mockito.`when`(messageMapper.map(event)).thenReturn(document)
        Mockito
            .doAnswer {
                invocationCount++
                if (invocationCount <= 2) {
                    throw IllegalStateException("Temporary OpenSearch failure")
                }
                OrderSearchProjectionWriteOutcome.APPLIED
            }.`when`(projection)
            .upsert(document)

        consumer.consume(event)

        assertEquals(3, invocationCount)
    }

    @Test
    fun `does not retry permanently invalid events`() {
        val event = event()
        Mockito
            .doThrow(InvalidOrderReadyEventException("Invalid event"))
            .`when`(messageMapper)
            .map(event)

        assertThrows(InvalidOrderReadyEventException::class.java) {
            consumer.consume(event)
        }
        Mockito.verify(messageMapper, Mockito.times(1)).map(event)
        Mockito.verifyNoInteractions(projection)
    }

    private fun event(): StructuredEvent {
        val orderId = UUID.randomUUID()
        return StructuredEvent(
            envelopeVersion = 1,
            eventId = UUID.randomUUID(),
            eventType = "OrderReady",
            eventVersion = 2,
            aggregateType = "ORDER",
            aggregateId = orderId,
            correlationId = UUID.randomUUID(),
            occurredAt = Instant.parse("2026-09-07T08:01:00Z"),
            payload = JsonNodeFactory.instance.objectNode(),
        )
    }

    private fun document(orderId: UUID): OrderSearchDocument =
        OrderSearchDocument(
            orderId = orderId,
            aggregateVersion = 3,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = "order-1001",
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("19.99"),
            receivedAt = Instant.parse("2026-09-07T08:00:00Z"),
            readyAt = Instant.parse("2026-09-07T08:01:00Z"),
            items =
                listOf(
                    OrderSearchItem(
                        sku = "SKU-1",
                        description = "Test item",
                        quantity = BigDecimal.ONE,
                        unitPrice = BigDecimal("19.99"),
                        lineAmount = BigDecimal("19.99"),
                        position = 0,
                    ),
                ),
        )
}
