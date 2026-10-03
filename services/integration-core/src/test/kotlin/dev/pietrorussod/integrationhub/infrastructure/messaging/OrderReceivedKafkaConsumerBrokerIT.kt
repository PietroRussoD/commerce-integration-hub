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
import org.apache.kafka.clients.admin.Admin
import org.apache.kafka.clients.admin.AdminClientConfig
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.TopicPartition
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.kafka.common.serialization.StringSerializer
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.nio.charset.StandardCharsets
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

    @ConfigProperty(name = "mp.messaging.incoming.order-received-in.group.id")
    lateinit var consumerGroupId: String

    @ConfigProperty(name = "mp.messaging.incoming.order-received-in.dead-letter-queue.topic")
    lateinit var deadLetterTopic: String

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

    @Test
    fun `acknowledges a duplicate record without repeating processing effects`() {
        val value = objectMapper.writeValueAsString(event())
        val duplicateMetadata =
            newProducer().use { producer ->
                producer.send(ProducerRecord(topic, orderId.toString(), value)).get(10, TimeUnit.SECONDS)
                producer.send(ProducerRecord(topic, orderId.toString(), value)).get(10, TimeUnit.SECONDS)
            }

        Admin.create(mapOf(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG to bootstrapServers)).use { admin ->
            awaitCondition("Duplicate record was not acknowledged before the timeout", Duration.ofSeconds(15)) {
                orderStatus() == "READY" && committedOffset(admin, duplicateMetadata) > duplicateMetadata.offset()
            }
        }

        assertEquals(1, dslContext.fetchCount(PROCESSED_MESSAGES))
        assertEquals(1, dslContext.fetchCount(PROCESSING_ATTEMPTS))
        assertEquals(2, dslContext.fetchCount(INTEGRATION_EVENTS))
        assertEquals(1, dslContext.fetchCount(OUTBOX_EVENTS))
    }

    @Test
    fun `routes a permanently invalid event to the dead letter topic`() {
        newConsumer().use { consumer ->
            consumer.subscribe(listOf(deadLetterTopic))
            val invalidEvent = event().copy(eventType = "OrderReady")

            newProducer().use { producer ->
                val record = ProducerRecord(topic, orderId.toString(), objectMapper.writeValueAsString(invalidEvent))
                producer.send(record).get(10, TimeUnit.SECONDS)
            }

            val deadLetterRecord =
                awaitDeadLetter(consumer) { record ->
                    runCatching { objectMapper.readTree(record.value())["eventType"].textValue() == "OrderReady" }
                        .getOrDefault(false)
                }
            val value = objectMapper.readTree(deadLetterRecord.value())
            assertEquals(eventId.toString(), value["eventId"].textValue())
            assertEquals("OrderReady", value["eventType"].textValue())
        }

        assertEquals("RECEIVED", orderStatus())
        assertEquals(0, dslContext.fetchCount(PROCESSED_MESSAGES))
        assertEquals(0, dslContext.fetchCount(PROCESSING_ATTEMPTS))
        assertEquals(0, dslContext.fetchCount(OUTBOX_EVENTS))
    }

    @Test
    fun `routes malformed JSON to the dead letter topic`() {
        newConsumer().use { consumer ->
            consumer.subscribe(listOf(deadLetterTopic))

            newProducer().use { producer ->
                producer
                    .send(ProducerRecord(topic, orderId.toString(), "{not-json"))
                    .get(10, TimeUnit.SECONDS)
            }

            val deadLetterRecord =
                awaitDeadLetter(consumer) { record ->
                    record.headerValue("deserialization-failure-topic") != null
                }
            assertEquals(topic, deadLetterRecord.headerValue("deserialization-failure-topic"))
        }

        assertEquals("RECEIVED", orderStatus())
        assertEquals(0, dslContext.fetchCount(PROCESSED_MESSAGES))
        assertEquals(0, dslContext.fetchCount(PROCESSING_ATTEMPTS))
        assertEquals(0, dslContext.fetchCount(OUTBOX_EVENTS))
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

    private fun newConsumer(): KafkaConsumer<String, String> {
        val properties =
            Properties().apply {
                put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers)
                put(ConsumerConfig.GROUP_ID_CONFIG, "integration-core-dlq-test-${UUID.randomUUID()}")
                put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest")
                put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false)
                put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
                put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
            }
        return KafkaConsumer(properties)
    }

    private fun awaitDeadLetter(
        consumer: KafkaConsumer<String, String>,
        predicate: (ConsumerRecord<String, String>) -> Boolean,
    ): ConsumerRecord<String, String> {
        val deadline = System.nanoTime() + Duration.ofSeconds(15).toNanos()
        while (System.nanoTime() < deadline) {
            consumer
                .poll(Duration.ofMillis(250))
                .records(deadLetterTopic)
                .firstOrNull(predicate)
                ?.let { return it }
        }
        throw AssertionError("Expected dead letter record was not received before the timeout")
    }

    private fun ConsumerRecord<String, String>.headerValue(name: String): String? =
        headers().lastHeader(name)?.let { String(it.value(), StandardCharsets.UTF_8) }

    private fun awaitProcessedOrder() =
        awaitCondition("Order was not processed before the timeout", Duration.ofSeconds(10)) {
            orderStatus() == "READY"
        }

    private fun awaitCondition(
        failureMessage: String,
        timeout: Duration,
        condition: () -> Boolean,
    ) {
        val deadline = System.nanoTime() + timeout.toNanos()
        while (System.nanoTime() < deadline) {
            if (condition()) {
                return
            }
            Thread.sleep(50)
        }
        throw AssertionError(failureMessage)
    }

    private fun orderStatus(): String? = dslContext.select(ORDERS.STATUS).from(ORDERS).fetchOne(ORDERS.STATUS)

    private fun committedOffset(
        admin: Admin,
        metadata: org.apache.kafka.clients.producer.RecordMetadata,
    ): Long =
        runCatching {
            val offsets =
                admin
                    .listConsumerGroupOffsets(consumerGroupId)
                    .partitionsToOffsetAndMetadata()
                    .get(2, TimeUnit.SECONDS)
            offsets[TopicPartition(metadata.topic(), metadata.partition())]?.offset() ?: -1L
        }.getOrDefault(-1L)

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
            payload =
                objectMapper.createObjectNode().apply {
                    put("orderId", orderId.toString())
                    put("sourceSystem", "marketplace-a")
                    put("externalOrderId", "order-1001")
                    put("currency", "EUR")
                    put("totalAmount", 19.99)
                    put("status", "RECEIVED")
                    putArray("items").addObject().put("sku", "SKU-1").put("quantity", 1)
                },
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
            "mp.messaging.incoming.order-received-in.dead-letter-queue.topic" to
                "integration.order.received.consumer-test.dlq.v1",
            "mp.messaging.outgoing.integration-events-out.connector" to "smallrye-kafka",
            "integration-hub.kafka.topics.order-received" to "integration.order.received.consumer-test.v1",
            "integration-hub.kafka.topics.order-ready" to "integration.order.ready.consumer-test.v1",
            "quarkus.otel.sdk.disabled" to "false",
            "quarkus.otel.traces.exporter" to "none",
        )
}
