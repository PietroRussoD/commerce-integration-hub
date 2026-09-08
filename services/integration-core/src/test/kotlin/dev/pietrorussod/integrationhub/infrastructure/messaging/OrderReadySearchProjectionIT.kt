package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjection
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import dev.pietrorussod.integrationhub.application.search.OrderSearchRepository
import dev.pietrorussod.integrationhub.application.search.SearchOrdersQuery
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.search.OpenSearchOrderIndexBootstrap
import dev.pietrorussod.integrationhub.infrastructure.search.OpenSearchOrderIndexBootstrapOutcome
import dev.pietrorussod.integrationhub.infrastructure.search.OpenSearchOrderIndexDefinition
import dev.pietrorussod.integrationhub.infrastructure.search.OpenSearchTestContainer
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.common.QuarkusTestResourceLifecycleManager
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import io.restassured.RestAssured.given
import jakarta.inject.Inject
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.ConsumerRecord
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.clients.producer.KafkaProducer
import org.apache.kafka.clients.producer.ProducerConfig
import org.apache.kafka.clients.producer.ProducerRecord
import org.apache.kafka.common.serialization.StringDeserializer
import org.apache.kafka.common.serialization.StringSerializer
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.opensearch.client.json.JsonData
import org.opensearch.client.opensearch.OpenSearchClient
import java.math.BigDecimal
import java.nio.charset.StandardCharsets
import java.time.Duration
import java.time.Instant
import java.util.Properties
import java.util.UUID
import java.util.concurrent.TimeUnit

@QuarkusTest
@TestProfile(OrderReadySearchProjectionBrokerTestProfile::class)
@QuarkusTestResource(OpenSearchProjectionTestResource::class, restrictToAnnotatedClass = true)
class OrderReadySearchProjectionIT {
    @Inject
    lateinit var objectMapper: ObjectMapper

    @Inject
    lateinit var openSearchClient: OpenSearchClient

    @Inject
    lateinit var indexBootstrap: OpenSearchOrderIndexBootstrap

    @Inject
    lateinit var messageMapper: OrderReadyMessageMapper

    @Inject
    lateinit var projection: OrderSearchProjection

    @Inject
    lateinit var orderSearchRepository: OrderSearchRepository

    @ConfigProperty(name = "kafka.bootstrap.servers")
    lateinit var bootstrapServers: String

    @ConfigProperty(name = "mp.messaging.incoming.order-ready-search-in.topic")
    lateinit var topic: String

    @ConfigProperty(name = "mp.messaging.incoming.order-ready-search-in.dead-letter-queue.topic")
    lateinit var deadLetterTopic: String

    @Test
    fun `creates the versioned index and keeps alias initialization idempotent`() {
        indexBootstrap.ensureReadAlias()

        assertTrue(
            openSearchClient
                .indices()
                .existsAlias { request -> request.name(OpenSearchOrderIndexDefinition.READ_ALIAS) }
                .value(),
        )
        assertEquals(OpenSearchOrderIndexBootstrapOutcome.ALREADY_EXISTS, indexBootstrap.ensureReadAlias())
    }

    @Test
    fun `reports the available order search projection through the operator API`() {
        indexBootstrap.ensureReadAlias()

        given()
            .`when`()
            .get("/api/v1/operator/orders/search/status")
            .then()
            .statusCode(200)
            .body("consumerEnabled", equalTo(true))
            .body("readAlias", equalTo(OpenSearchOrderIndexDefinition.READ_ALIAS))
            .body("availability", equalTo("AVAILABLE"))
            .body("reconciliationInProgress", equalTo(false))
    }

    @Test
    fun `keeps the newest order aggregate version`() {
        val current = event(aggregateVersion = 3, externalOrderId = "ORDER-3")
        val duplicate = event(current.aggregateId, aggregateVersion = 3, externalOrderId = "DUPLICATE")
        val stale = event(current.aggregateId, aggregateVersion = 2, externalOrderId = "STALE")

        assertEquals(OrderSearchProjectionWriteOutcome.APPLIED, projection.upsert(messageMapper.map(current)))
        assertEquals(
            OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION,
            projection.upsert(messageMapper.map(duplicate)),
        )
        assertEquals(
            OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION,
            projection.upsert(messageMapper.map(stale)),
        )

        val stored = awaitProjectedDocument(current.aggregateId)
        assertEquals(3, stored.getInt("aggregateVersion"))
        assertEquals("ORDER-3", stored.getString("externalOrderId"))
    }

    @Test
    fun `projects an OrderReady record from Kafka into OpenSearch`() {
        val event = event()

        newProducer().use { producer ->
            producer
                .send(ProducerRecord(topic, event.aggregateId.toString(), objectMapper.writeValueAsString(event)))
                .get(10, TimeUnit.SECONDS)
        }

        val stored = awaitProjectedDocument(event.aggregateId)
        assertEquals(3, stored.getInt("aggregateVersion"))
        assertEquals("order-1001", stored.getString("externalOrderId"))
        assertEquals("READY", stored.getString("status"))
        assertEquals("SKU-1", stored.getJsonArray("itemSkus").getString(0))
    }

    @Test
    fun `searches projected orders through the read alias`() {
        val event = event(externalOrderId = "SEARCH-1001")
        assertEquals(OrderSearchProjectionWriteOutcome.APPLIED, projection.upsert(messageMapper.map(event)))
        openSearchClient.indices().refresh { request -> request.index(OpenSearchOrderIndexDefinition.READ_ALIAS) }

        val page =
            orderSearchRepository.search(
                SearchOrdersQuery(
                    text = "test item",
                    sourceSystem = SourceSystem.from("marketplace-a"),
                    externalOrderId = ExternalOrderId.from("SEARCH-1001"),
                    status = OrderStatus.READY,
                    currency = Currency.EUR,
                    sku = "SKU-1",
                    receivedAtFrom = Instant.parse("2026-09-07T08:00:00Z"),
                    receivedAtBefore = Instant.parse("2026-09-08T08:00:00Z"),
                    limit = 20,
                    offset = 0,
                ),
            )

        assertEquals(1, page.total)
        assertEquals(event.aggregateId, page.items.single().orderId)
        assertEquals(
            "SEARCH-1001",
            page.items
                .single()
                .externalOrderId.value,
        )
        assertEquals(listOf("SKU-1"), page.items.single().itemSkus)
        assertEquals(listOf("Test item"), page.items.single().itemDescriptions)
    }

    @Test
    fun `exposes projected order search through the operator API`() {
        val event = event(externalOrderId = "HTTP-1001")
        assertEquals(OrderSearchProjectionWriteOutcome.APPLIED, projection.upsert(messageMapper.map(event)))
        openSearchClient.indices().refresh { request -> request.index(OpenSearchOrderIndexDefinition.READ_ALIAS) }

        given()
            .queryParam("q", "test item")
            .queryParam("sourceSystem", "marketplace-a")
            .queryParam("externalOrderId", "HTTP-1001")
            .queryParam("status", "ready")
            .queryParam("currency", "eur")
            .queryParam("sku", "SKU-1")
            .queryParam("receivedAtFrom", "2026-09-07T08:00:00Z")
            .queryParam("receivedAtBefore", "2026-09-08T08:00:00Z")
            .`when`()
            .get("/api/v1/operator/orders/search")
            .then()
            .statusCode(200)
            .body("items.size()", equalTo(1))
            .body("items[0].id", equalTo(event.aggregateId.toString()))
            .body("items[0].aggregateVersion", equalTo(3))
            .body("items[0].externalOrderId", equalTo("HTTP-1001"))
            .body("items[0].itemSkus", equalTo(listOf("SKU-1")))
            .body("total", equalTo(1))
    }

    @Test
    fun `rejects invalid operator search parameters`() {
        given()
            .queryParam("sku", " ")
            .`when`()
            .get("/api/v1/operator/orders/search")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_OPERATOR_ORDER_SEARCH_QUERY"))
            .body("errors[0].field", equalTo("sku"))
    }

    @Test
    fun `routes an invalid OrderReady record to the dead letter topic`() {
        val invalidEvent = event().copy(eventVersion = 1)

        newConsumer().use { consumer ->
            consumer.subscribe(listOf(deadLetterTopic))
            newProducer().use { producer ->
                producer
                    .send(
                        ProducerRecord(
                            topic,
                            invalidEvent.aggregateId.toString(),
                            objectMapper.writeValueAsString(invalidEvent),
                        ),
                    ).get(10, TimeUnit.SECONDS)
            }

            val deadLetterRecord =
                awaitDeadLetter(consumer) { record ->
                    runCatching {
                        objectMapper.readTree(record.value())["eventId"].textValue() == invalidEvent.eventId.toString()
                    }.getOrDefault(false)
                }

            assertEquals(topic, deadLetterRecord.headerValue("dead-letter-topic"))
            assertTrue(deadLetterRecord.headerValue("dead-letter-reason")?.isNotBlank() == true)
        }
    }

    private fun awaitProjectedDocument(orderId: UUID): jakarta.json.JsonObject {
        val deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos()
        while (System.nanoTime() < deadline) {
            val response =
                runCatching {
                    openSearchClient.get(
                        { request ->
                            request
                                .index(OpenSearchOrderIndexDefinition.READ_ALIAS)
                                .id(orderId.toString())
                        },
                        JsonData::class.java,
                    )
                }.getOrNull()
            if (response?.found() == true) {
                return requireNotNull(response.source()).toJson().asJsonObject()
            }
            Thread.sleep(100)
        }
        throw AssertionError("Order was not projected before the timeout")
    }

    private fun awaitDeadLetter(
        consumer: KafkaConsumer<String, String>,
        predicate: (ConsumerRecord<String, String>) -> Boolean,
    ): ConsumerRecord<String, String> {
        val deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos()
        while (System.nanoTime() < deadline) {
            consumer
                .poll(Duration.ofMillis(250))
                .records(deadLetterTopic)
                .firstOrNull(predicate)
                ?.let { return it }
        }
        throw AssertionError("Expected dead letter record was not received before the timeout")
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
                put(ConsumerConfig.GROUP_ID_CONFIG, "order-search-dlq-test-${UUID.randomUUID()}")
                put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest")
                put(ConsumerConfig.ENABLE_AUTO_COMMIT_CONFIG, false)
                put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
                put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
            }
        return KafkaConsumer(properties)
    }

    private fun ConsumerRecord<String, String>.headerValue(name: String): String? =
        headers().lastHeader(name)?.let { String(it.value(), StandardCharsets.UTF_8) }

    private fun event(
        orderId: UUID = UUID.randomUUID(),
        aggregateVersion: Long = 3,
        externalOrderId: String = "order-1001",
    ): StructuredEvent {
        val readyAt = Instant.parse("2026-09-07T08:01:00Z")
        return StructuredEvent(
            envelopeVersion = 1,
            eventId = UUID.randomUUID(),
            eventType = "OrderReady",
            eventVersion = 2,
            aggregateType = "ORDER",
            aggregateId = orderId,
            correlationId = UUID.randomUUID(),
            occurredAt = readyAt,
            payload =
                objectMapper.valueToTree(
                    OrderReadyV2Payload(
                        orderId = orderId,
                        aggregateVersion = aggregateVersion,
                        sourceSystem = "marketplace-a",
                        externalOrderId = externalOrderId,
                        currency = "EUR",
                        totalAmount = BigDecimal("19.99"),
                        status = "READY",
                        receivedAt = Instant.parse("2026-09-07T08:00:00Z"),
                        readyAt = readyAt,
                        items =
                            listOf(
                                OrderReadyV2ItemPayload(
                                    externalLineId = "line-1",
                                    sku = "SKU-1",
                                    description = "Test item",
                                    quantity = BigDecimal.ONE,
                                    unitPrice = BigDecimal("19.99"),
                                    lineAmount = BigDecimal("19.99"),
                                    position = 0,
                                ),
                            ),
                    ),
                ),
        )
    }
}

class OrderReadySearchProjectionBrokerTestProfile : QuarkusTestProfile {
    override fun getConfigOverrides(): Map<String, String> =
        mapOf(
            "quarkus.kafka.devservices.enabled" to "true",
            "mp.messaging.incoming.order-ready-search-in.enabled" to "true",
            "mp.messaging.incoming.order-ready-search-in.connector" to "smallrye-kafka",
            "mp.messaging.incoming.order-ready-search-in.topic" to "integration.order.ready.search-test.v2",
            "mp.messaging.incoming.order-ready-search-in.dead-letter-queue.topic" to
                "integration.order.ready.search-test.dlq.v2",
        )
}

class OpenSearchProjectionTestResource : QuarkusTestResourceLifecycleManager {
    private lateinit var openSearch: OpenSearchTestContainer

    override fun start(): Map<String, String> {
        openSearch = OpenSearchTestContainer()
        openSearch.start()
        return mapOf("integration-hub.opensearch.url" to openSearch.endpoint())
    }

    override fun stop() {
        if (::openSearch.isInitialized) {
            openSearch.stop()
        }
    }
}
