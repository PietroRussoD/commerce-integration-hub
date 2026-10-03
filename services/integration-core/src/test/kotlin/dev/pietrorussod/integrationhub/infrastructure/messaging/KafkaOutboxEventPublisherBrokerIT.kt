package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventPublisher
import dev.pietrorussod.integrationhub.application.outbox.PublicationOutcome
import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import jakarta.inject.Inject
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.serialization.StringDeserializer
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
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
    fun `publishes OrderReady version 2 to its dedicated topic`() {
        assertPublished(outboundEvent(eventType = "OrderReady", eventVersion = 2), orderReadyTopic)
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
            assertEquals(event.eventVersion.toString(), record.headerValue("event-version"))
            assertEquals(event.correlationId.toString(), record.headerValue("correlation-id"))
            val expectedTraceParent = requireNotNull(event.traceContext).traceparent.split('-')
            val actualTraceParent = record.headerValue("traceparent").split('-')
            assertEquals(4, expectedTraceParent.size)
            assertEquals(expectedTraceParent[1], actualTraceParent[1])
            assertEquals(4, actualTraceParent.size)
            assertNotEquals(expectedTraceParent[2], actualTraceParent[2])
            assertEquals("vendor=value", record.headerValue("tracestate"))
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

    private fun outboundEvent(
        eventType: String,
        eventVersion: Int = 1,
    ): OutboundIntegrationEvent =
        OutboundIntegrationEvent(
            envelopeVersion = 1,
            eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
            eventType = eventType,
            eventVersion = eventVersion,
            aggregateType = "ORDER",
            aggregateId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            occurredAt = Instant.parse("2026-08-20T08:00:00Z"),
            payload = "{\"orderId\":\"order-123\"}",
            traceContext =
                TraceContext(
                    traceparent = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
                    tracestate = "vendor=value",
                ),
        )
}

class KafkaBrokerTestProfile : QuarkusTestProfile {
    override fun getConfigOverrides(): Map<String, String> =
        mapOf(
            "quarkus.kafka.devservices.enabled" to "true",
            "mp.messaging.outgoing.integration-events-out.connector" to "smallrye-kafka",
            "quarkus.otel.sdk.disabled" to "false",
            "quarkus.otel.traces.exporter" to "none",
        )
}
