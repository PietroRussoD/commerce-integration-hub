package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.processing.OrderNotFoundForProcessingException
import dev.pietrorussod.integrationhub.application.processing.OrderReceivedProcessor
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedCommand
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedResult
import dev.pietrorussod.integrationhub.domain.order.OrderId
import io.quarkus.test.InjectMock
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.mockito.Mockito
import java.time.Instant
import java.util.UUID

@QuarkusTest
class OrderReceivedKafkaConsumerRetryIT {
    @Inject
    lateinit var consumer: OrderReceivedKafkaConsumer

    @Inject
    lateinit var objectMapper: ObjectMapper

    @InjectMock
    lateinit var processor: OrderReceivedProcessor

    @Test
    fun `retries transient failures and eventually succeeds`() {
        val event = event()
        val command = commandFor(event)
        var invocationCount = 0
        Mockito
            .doAnswer {
                invocationCount++
                if (invocationCount <= 2) {
                    throw IllegalStateException("Temporary processing failure")
                }
                ProcessOrderReceivedResult.Duplicate
            }.`when`(processor)
            .process(command)

        consumer.consume(event)

        assertEquals(3, invocationCount)
    }

    @Test
    fun `does not retry permanent processing rejections`() {
        val event = event()
        val command = commandFor(event)
        Mockito
            .doThrow(OrderNotFoundForProcessingException(command.orderId))
            .`when`(processor)
            .process(command)

        assertThrows(OrderNotFoundForProcessingException::class.java) {
            consumer.consume(event)
        }
        Mockito.verify(processor, Mockito.times(1)).process(command)
    }

    private fun event(): StructuredEvent {
        val orderId = UUID.randomUUID()
        return StructuredEvent(
            envelopeVersion = 1,
            eventId = UUID.randomUUID(),
            eventType = "OrderReceived",
            eventVersion = 1,
            aggregateType = "ORDER",
            aggregateId = orderId,
            correlationId = UUID.randomUUID(),
            occurredAt = Instant.parse("2026-08-22T10:00:00Z"),
            payload = objectMapper.createObjectNode().put("orderId", orderId.toString()),
        )
    }

    private fun commandFor(event: StructuredEvent): ProcessOrderReceivedCommand =
        ProcessOrderReceivedCommand(
            eventId = event.eventId,
            orderId = OrderId(event.aggregateId),
            correlationId = event.correlationId,
        )
}
