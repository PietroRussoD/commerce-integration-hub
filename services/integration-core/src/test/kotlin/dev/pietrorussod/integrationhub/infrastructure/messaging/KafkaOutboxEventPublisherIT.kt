package dev.pietrorussod.integrationhub.infrastructure.messaging

import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventPublisher
import dev.pietrorussod.integrationhub.application.outbox.PublicationFailureKind
import dev.pietrorussod.integrationhub.application.outbox.PublicationOutcome
import io.quarkus.test.junit.QuarkusTest
import io.smallrye.reactive.messaging.kafka.api.OutgoingKafkaRecordMetadata
import io.smallrye.reactive.messaging.memory.InMemoryConnector
import jakarta.inject.Inject
import org.eclipse.microprofile.reactive.messaging.spi.Connector
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.nio.charset.StandardCharsets
import java.time.Instant
import java.util.UUID

@QuarkusTest
class KafkaOutboxEventPublisherIT {
    @Inject
    lateinit var publisher: OutboxEventPublisher

    @Inject
    @Connector("smallrye-in-memory")
    lateinit var connector: InMemoryConnector

    @BeforeEach
    fun clearMessages() {
        connector.sink<StructuredEvent>("integration-events-out").clear()
    }

    @Test
    fun `publishes the structured event and waits for acknowledgement`() {
        val source = outboundEvent("{\"orderId\":\"order-123\"}")

        val outcome = publisher.publish(source)

        assertEquals(PublicationOutcome.Acknowledged, outcome)
        val messages = connector.sink<StructuredEvent>("integration-events-out").received()
        assertEquals(1, messages.size)
        assertEquals(source.eventId, messages.single().payload.eventId)
        assertEquals(
            "order-123",
            messages
                .single()
                .payload.payload["orderId"]
                .textValue(),
        )

        val metadata =
            messages
                .single()
                .getMetadata(OutgoingKafkaRecordMetadata::class.java)
                .orElseThrow()
        assertEquals(source.aggregateId.toString(), metadata.key)
        assertEquals(
            source.eventId.toString(),
            String(metadata.headers.lastHeader("event-id").value(), StandardCharsets.UTF_8),
        )
    }

    @Test
    fun `rejects an invalid payload without sending a message`() {
        val outcome = publisher.publish(outboundEvent("[]"))

        assertEquals(
            PublicationOutcome.Failed(
                kind = PublicationFailureKind.NON_RETRYABLE,
                errorCode = "INVALID_EVENT_PAYLOAD",
                safeErrorMessage = "Outbound event payload is not valid for publication",
            ),
            outcome,
        )
        assertEquals(0, connector.sink<StructuredEvent>("integration-events-out").received().size)
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
