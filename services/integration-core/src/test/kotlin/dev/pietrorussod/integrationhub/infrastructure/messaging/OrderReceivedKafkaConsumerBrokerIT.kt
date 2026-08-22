package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import jakarta.inject.Inject
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.serialization.StringSerializer
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime
import java.util.Properties
import java.util.UUID
import java.util.concurrent.TimeUnit

@QuarkusTest
@TestProfile(OrderReceivedKafkaConsumerBrokerTestProfile::class)
class OrderReceivedKafkaConsumerBrokerIT {
    private val orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
    private val eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f60")
    private val correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55")

    @Inject
    lateinit var dslContext: DSLContext

    @Inject
    lateinit var objectMapper: ObjectMapper

    @ConfigProperty(name = "kafka.bootstrap.servers")
    lateinit var bootstrapServers: String

    @ConfigProperty(name = "mp.messaging.incoming.order-received-in.topic")
    lateinit var topic: String

    @BeforeEach
    fun prepareOrder() {
        deleteData()
        insertReceivedOrder()
    }

    @Test
    fun `consumes and processes an OrderReceived record from Kafka`() {
        newProducer().use { producer ->
            val record = ProducerRecord(topic, orderId.toString(), objectMapper.writeValueAsString(event()))
            producer.send(record).get(10, TimeUnit.SECONDS)
        }

        awaitProcessedOrder()

        assertEquals("READY", dslContext.selectFrom(ORDERS).fetchSingle().status)
        assertEquals(1, dslContext.fetchCount(PROCESSED_MESSAGES))
        assertEquals(1, dslContext.fetchCount(PROCESSING_ATTEMPTS))
        assertEquals(2, dslContext.fetchCount(INTEGRATION_EVENTS))
        assertEquals(1, dslContext.fetchCount(OUTBOX_EVENTS))
    }

    private fun newProducer(): KafkaProducer<String, String> {
        val properties =
            Properties().apply {
                put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers)
                put(ProducerConfig.ACKS_CONFIG, "all")
                put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer::class.java)
                put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer::class.java)
            }
        return KafkaProducer(properties)
    }

    private fun awaitProcessedOrder() {
        val deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos()
        while (System.nanoTime() < deadline) {
            val status = dslContext.select(ORDERS.STATUS).from(ORDERS).fetchOne(ORDERS.STATUS)
            if (status == "READY") {
                return
            }
            Thread.sleep(50)
        }
        throw AssertionError("Order was not processed before the timeout")
    }

    private fun event(): StructuredEvent =
        StructuredEvent(
            envelopeVersion = 1,
            eventId = eventId,
            eventType = "OrderReceived",
            eventVersion = 1,
            aggregateType = "ORDER",
            aggregateId = orderId,
            correlationId = correlationId,
            occurredAt = Instant.parse("2026-08-22T08:01:00Z"),
            payload = objectMapper.createObjectNode().put("orderId", orderId.toString()),
        )

    private fun deleteData() {
        dslContext.deleteFrom(PROCESSED_MESSAGES).execute()
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
        dslContext.deleteFrom(PROCESSING_ATTEMPTS).execute()
        dslContext.deleteFrom(INTEGRATION_EVENTS).execute()
        dslContext.deleteFrom(ORDER_ITEMS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    private fun insertReceivedOrder() {
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, orderId)
            .set(ORDERS.SOURCE_SYSTEM, "marketplace-a")
            .set(ORDERS.EXTERNAL_ORDER_ID, "order-1001")
            .set(ORDERS.STATUS, "RECEIVED")
            .set(ORDERS.CURRENCY, "EUR")
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal("19.99"))
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.RECEIVED_AT, OffsetDateTime.parse("2026-08-22T08:00:00Z"))
            .execute()
        dslContext
            .insertInto(ORDER_ITEMS)
            .set(ORDER_ITEMS.ID, UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53"))
            .set(ORDER_ITEMS.ORDER_ID, orderId)
            .set(ORDER_ITEMS.EXTERNAL_LINE_ID, "line-1")
            .set(ORDER_ITEMS.SKU, "SKU-1")
            .set(ORDER_ITEMS.DESCRIPTION, "Test item")
            .set(ORDER_ITEMS.QUANTITY, BigDecimal.ONE)
            .set(ORDER_ITEMS.UNIT_PRICE, BigDecimal("19.99"))
            .set(ORDER_ITEMS.LINE_AMOUNT, BigDecimal("19.99"))
            .set(ORDER_ITEMS.POSITION, 0)
            .execute()
    }
}

class OrderReceivedKafkaConsumerBrokerTestProfile : QuarkusTestProfile {
    override fun getConfigOverrides(): Map<String, String> =
        mapOf(
            "quarkus.kafka.devservices.enabled" to "true",
            "mp.messaging.incoming.order-received-in.connector" to "smallrye-kafka",
            "mp.messaging.incoming.order-received-in.topic" to "integration.order.received.consumer-test.v1",
        )
}
