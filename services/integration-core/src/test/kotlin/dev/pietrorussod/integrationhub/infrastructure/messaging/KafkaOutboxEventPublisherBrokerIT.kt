package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventPublisher
import dev.pietrorussod.integrationhub.application.outbox.PublicationOutcome
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import jakarta.inject.Inject
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.serialization.StringDeserializer
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.Properties
import java.util.UUID

@QuarkusTest
@TestProfile(KafkaBrokerTestProfile::class)
class KafkaOutboxEventPublisherBrokerIT {
    @Inject
    lateinit var publisher: OutboxEventPublisher

    @Inject
    lateinit var objectMapper: ObjectMapper

    @ConfigProperty(name = "kafka.bootstrap.servers")
    lateinit var bootstrapServers: String

    @ConfigProperty(name = "integration-hub.kafka.topics.order-received")
    lateinit var orderReceivedTopic: String

    @ConfigProperty(name = "integration-hub.kafka.topics.order-ready")
    lateinit var orderReadyTopic: String

    @Test
    fun `publishes OrderReceived version 1 to its dedicated topic`() {
        assertPublished(outboundEvent(eventType = "OrderReceived"), orderReceivedTopic)
    }

    @Test
    fun `publishes OrderReady version 1 to its dedicated topic`() {
        assertPublished(outboundEvent(eventType = "OrderReady"), orderReadyTopic)
    }

    private fun assertPublished(
        event: OutboundIntegrationEvent,
        topic: String,
    ) {
        newConsumer().use { consumer ->
            consumer.subscribe(listOf(topic))

            val outcome = publisher.publish(event)

            assertEquals(PublicationOutcome.Acknowledged, outcome)
            val record = consumer.poll(Duration.ofSeconds(10)).records(topic).single()
            val value = objectMapper.readTree(record.value())
            assertEquals(event.aggregateId.toString(), record.key())
            assertEquals(event.eventId.toString(), value["eventId"].textValue())
            assertEquals("order-123", value["payload"]["orderId"].textValue())
            assertEquals(event.eventId.toString(), record.headerValue("event-id"))
            assertEquals(event.eventType, record.headerValue("event-type"))
            assertEquals(event.correlationId.toString(), record.headerValue("correlation-id"))
        }
    }

    private fun newConsumer(): KafkaConsumer<String, String> {
        val properties =
            Properties().apply {
                put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers)
                put(ConsumerConfig.GROUP_ID_CONFIG, "integration-core-broker-test-${UUID.randomUUID()}")
                put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest")
                put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false)
                put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
                put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
            }
        return KafkaConsumer(properties)
    }

    private fun org.apache.kafka.clients.consumer.ConsumerRecord<String, String>.headerValue(name: String): String =
        String(headers().lastHeader(name).value(), StandardCharsets.UTF_8)

    private fun outboundEvent(eventType: String): OutboundIntegrationEvent =
        OutboundIntegrationEvent(
            envelopeVersion = 1,
            eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
            eventType = eventType,
            eventVersion = 1,
            aggregateType = "ORDER",
            aggregateId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            occurredAt = Instant.parse("2026-08-20T08:00:00Z"),
            payload = "{\"orderId\":\"order-123\"}",
        )
}

class KafkaBrokerTestProfile : QuarkusTestProfile {
    override fun getConfigOverrides(): Map<String, String> =
        mapOf(
            "quarkus.kafka.devservices.enabled" to "true",
            "mp.messaging.outgoing.integration-events-out.connector" to "smallrye-kafka",
        )
}
