package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.api.security.SOURCE_API_KEY_HEADER
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import dev.pietrorussod.integrationhub.infrastructure.provisioning.SourceCredentialProvisioner
import dev.pietrorussod.integrationhub.infrastructure.scheduling.OutboxDispatchScheduler
import dev.pietrorussod.integrationhub.infrastructure.security.SourceCredentialPepperProvider
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.TestProfile
import io.restassured.RestAssured.given
import jakarta.inject.Inject
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.serialization.StringDeserializer
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.hamcrest.Matchers.equalTo
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Duration
import java.util.Properties
import java.util.UUID

@QuarkusTest
@TestProfile(OrderReceivedKafkaConsumerBrokerTestProfile::class)
class OrderProcessingEndToEndBrokerIT {
    private val traceId = "0123456789abcdef0123456789abcdef"
    private val incomingSpanId = "0123456789abcdef"

    @Inject
    lateinit var dslContext: DSLContext

    @Inject
    lateinit var objectMapper: ObjectMapper

    @Inject
    lateinit var orderReadyMessageMapper: OrderReadyMessageMapper

    @Inject
    lateinit var pepperProvider: SourceCredentialPepperProvider

    @Inject
    lateinit var outboxDispatchScheduler: OutboxDispatchScheduler

    @ConfigProperty(name = "kafka.bootstrap.servers")
    lateinit var bootstrapServers: String

    @ConfigProperty(name = "integration-hub.kafka.topics.order-ready")
    lateinit var orderReadyTopic: String

    @ConfigProperty(name = "mp.messaging.incoming.order-received-in.dead-letter-queue.topic")
    lateinit var deadLetterTopic: String

    @BeforeEach
    fun resetState() {
        dslContext.deleteFrom(PROCESSED_MESSAGES).execute()
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
        dslContext.deleteFrom(PROCESSING_ATTEMPTS).execute()
        dslContext.deleteFrom(INTEGRATION_EVENTS).execute()
        dslContext.deleteFrom(ORDER_ITEMS).execute()
        dslContext.deleteFrom(ORDERS).execute()
        dslContext.deleteFrom(SOURCE_CREDENTIALS).execute()
    }

    @Test
    fun `processes an order from HTTP ingestion to the OrderReady topic`() {
        val credential = SourceCredentialProvisioner(dslContext, pepperProvider).provision("MARKETPLACE_A", 1)

        newConsumer("ready").use { readyConsumer ->
            newConsumer("dlq").use { deadLetterConsumer ->
                readyConsumer.subscribe(listOf(orderReadyTopic))
                deadLetterConsumer.subscribe(listOf(deadLetterTopic))

                val createResponse =
                    given()
                        .header(SOURCE_API_KEY_HEADER, credential.apiKey)
                        .header("traceparent", "00-$traceId-$incomingSpanId-01")
                        .header("tracestate", "vendor=value")
                        .contentType("application/json")
                        .body(orderRequest())
                        .post("/api/v1/orders")

                createResponse.then().statusCode(201).body("status", equalTo("RECEIVED"))
                val orderId = UUID.fromString(createResponse.jsonPath().getString("id"))

                outboxDispatchScheduler.dispatchPendingEvents()
                awaitCondition("Order did not reach READY before the timeout") {
                    orderStatus(orderId) == "READY"
                }
                outboxDispatchScheduler.dispatchPendingEvents()

                val readyEvent =
                    awaitRecord(readyConsumer, orderReadyTopic) { record ->
                        val event = runCatching { objectMapper.readTree(record.value()) }.getOrNull()
                        event?.get("aggregateId")?.textValue() == orderId.toString()
                    }
                assertEquals("OrderReady", objectMapper.readTree(readyEvent.value())["eventType"].textValue())
                val readyDocument =
                    orderReadyMessageMapper.map(objectMapper.readValue(readyEvent.value(), StructuredEvent::class.java))
                assertEquals(orderId, readyDocument.orderId)
                val readyTraceParent = readyEvent.headerValue("traceparent").split('-')
                assertEquals(traceId, readyTraceParent[1])
                assertEquals("vendor=value", readyEvent.headerValue("tracestate"))

                val persistedTraceParent =
                    requireNotNull(
                        dslContext
                            .select(OUTBOX_EVENTS.TRACEPARENT)
                            .from(OUTBOX_EVENTS)
                            .where(OUTBOX_EVENTS.EVENT_TYPE.eq("OrderReady"))
                            .fetchOne(OUTBOX_EVENTS.TRACEPARENT),
                    ).split('-')
                assertEquals(traceId, persistedTraceParent[1])
                assertNotEquals(incomingSpanId, persistedTraceParent[2])
                assertNotEquals(persistedTraceParent[2], readyTraceParent[2])
                assertEquals(
                    "vendor=value",
                    dslContext
                        .select(OUTBOX_EVENTS.TRACESTATE)
                        .from(OUTBOX_EVENTS)
                        .where(OUTBOX_EVENTS.EVENT_TYPE.eq("OrderReady"))
                        .fetchOne(OUTBOX_EVENTS.TRACESTATE),
                )

                assertNoRecord(deadLetterConsumer, deadLetterTopic) { record ->
                    runCatching {
                        objectMapper.readTree(record.value())["aggregateId"].textValue() == orderId.toString()
                    }.getOrDefault(false)
                }

                given()
                    .header(SOURCE_API_KEY_HEADER, credential.apiKey)
                    .contentType("application/json")
                    .body(orderRequest())
                    .post("/api/v1/orders")
                    .then()
                    .statusCode(200)
                    .header("Idempotent-Replay", equalTo("true"))
                    .body("id", equalTo(orderId.toString()))

                assertEquals(1, dslContext.fetchCount(ORDERS))
                assertEquals(1, dslContext.fetchCount(PROCESSED_MESSAGES))
                assertEquals(1, dslContext.fetchCount(PROCESSING_ATTEMPTS))
                assertEquals(3, dslContext.fetchCount(INTEGRATION_EVENTS))
                assertEquals(2, dslContext.fetchCount(OUTBOX_EVENTS))
                assertEquals(
                    listOf("PUBLISHED", "PUBLISHED"),
                    dslContext.select(OUTBOX_EVENTS.STATUS).from(OUTBOX_EVENTS).fetch(OUTBOX_EVENTS.STATUS),
                )
            }
        }
    }

    private fun newConsumer(purpose: String): KafkaConsumer<String, String> {
        val properties =
            Properties().apply {
                put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, bootstrapServers)
                put(ConsumerConfig.GROUP_ID_CONFIG, "integration-core-e2e-$purpose-${UUID.randomUUID()}")
                put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest")
                put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false)
                put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
                put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
            }
        return KafkaConsumer(properties)
    }

    private fun awaitRecord(
        consumer: KafkaConsumer<String, String>,
        topic: String,
        predicate: (ConsumerRecord<String, String>) -> Boolean,
    ): ConsumerRecord<String, String> {
        val deadline = System.nanoTime() + BROKER_TIMEOUT.toNanos()
        while (System.nanoTime() < deadline) {
            consumer
                .poll(POLL_INTERVAL)
                .records(topic)
                .firstOrNull(predicate)
                ?.let { return it }
        }
        throw AssertionError("Expected record was not received from $topic before the timeout")
    }

    private fun assertNoRecord(
        consumer: KafkaConsumer<String, String>,
        topic: String,
        predicate: (ConsumerRecord<String, String>) -> Boolean,
    ) {
        val deadline = System.nanoTime() + NO_RECORD_TIMEOUT.toNanos()
        while (System.nanoTime() < deadline) {
            if (consumer.poll(POLL_INTERVAL).records(topic).any(predicate)) {
                throw AssertionError("Unexpected record was received from $topic")
            }
        }
    }

    private fun awaitCondition(
        failureMessage: String,
        condition: () -> Boolean,
    ) {
        val deadline = System.nanoTime() + BROKER_TIMEOUT.toNanos()
        while (System.nanoTime() < deadline) {
            if (condition()) {
                return
            }
            Thread.sleep(50)
        }
        throw AssertionError(failureMessage)
    }

    private fun orderStatus(orderId: UUID): String? =
        dslContext
            .select(ORDERS.STATUS)
            .from(ORDERS)
            .where(ORDERS.ID.eq(orderId))
            .fetchOne(ORDERS.STATUS)

    private fun orderRequest(): String =
        """
        {
          "externalId": "E2E-ORDER-2026-00001",
          "currency": "EUR",
          "declaredTotalAmount": "39.98",
          "items": [
            {
              "externalLineId": "1",
              "sku": "SKU-E2E-1",
              "description": "End-to-end test item",
              "quantity": "2",
              "unitPrice": "19.99"
            }
          ]
        }
        """.trimIndent()

    private fun ConsumerRecord<String, String>.headerValue(name: String): String =
        String(headers().lastHeader(name).value(), Charsets.UTF_8)

    private companion object {
        val BROKER_TIMEOUT: Duration = Duration.ofSeconds(15)
        val NO_RECORD_TIMEOUT: Duration = Duration.ofSeconds(1)
        val POLL_INTERVAL: Duration = Duration.ofMillis(250)
    }
}
