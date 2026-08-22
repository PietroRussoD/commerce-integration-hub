package dev.pietrorussod.integrationhub.infrastructure.processing

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.processing.OrderNotFoundForProcessingException
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedCommand
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedResult
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.infrastructure.messaging.OrderReceivedKafkaConsumer
import dev.pietrorussod.integrationhub.infrastructure.messaging.StructuredEvent
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.time.OffsetDateTime
import java.util.UUID

@QuarkusTest
class TransactionalOrderReceivedProcessorIT {
    private val objectMapper = ObjectMapper()
    private val orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
    private val eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f60")
    private val correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55")
    private val receivedAt = OffsetDateTime.parse("2026-08-22T08:00:00Z")

    @Inject
    lateinit var processor: TransactionalOrderReceivedProcessor

    @Inject
    lateinit var consumer: OrderReceivedKafkaConsumer

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteData() {
        dslContext.deleteFrom(PROCESSED_MESSAGES).execute()
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
        dslContext.deleteFrom(PROCESSING_ATTEMPTS).execute()
        dslContext.deleteFrom(INTEGRATION_EVENTS).execute()
        dslContext.deleteFrom(ORDER_ITEMS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `commits every successful processing effect atomically`() {
        insertReceivedOrder()

        val result = processor.process(command(orderId))

        val processed = result as ProcessOrderReceivedResult.Processed
        assertEquals("READY", processed.order.status.name)
        assertEquals("READY", dslContext.selectFrom(ORDERS).fetchSingle().status)

        val inboxRecord = dslContext.selectFrom(PROCESSED_MESSAGES).fetchSingle()
        assertEquals("order-processor", inboxRecord.consumerName)
        assertEquals(eventId, inboxRecord.eventId)

        val attempt = dslContext.selectFrom(PROCESSING_ATTEMPTS).fetchSingle()
        assertEquals(orderId, attempt.orderId)
        assertEquals(1, attempt.attemptNumber)
        assertEquals("SUCCEEDED", attempt.status)
        assertEquals("INITIAL", attempt.triggerType)

        val timeline = dslContext.selectFrom(INTEGRATION_EVENTS).fetch()
        assertEquals(2, timeline.size)
        assertEquals(setOf("PROCESSING_STARTED", "PROCESSING_SUCCEEDED"), timeline.map { it.eventType }.toSet())
        assertEquals(setOf(correlationId), timeline.map { it.correlationId }.toSet())

        val outboxEvent = dslContext.selectFrom(OUTBOX_EVENTS).fetchSingle()
        assertEquals(orderId, outboxEvent.aggregateId)
        assertEquals("OrderReady", outboxEvent.eventType)
        assertEquals(1, outboxEvent.eventVersion)
        assertEquals("PENDING", outboxEvent.status)
        assertEquals(0, outboxEvent.publishAttempts)
        assertEquals(correlationId, outboxEvent.correlationId)
        val payload = objectMapper.readTree(outboxEvent.payload?.data())
        assertEquals(orderId.toString(), payload["orderId"].textValue())
        assertEquals("READY", payload["status"].textValue())
    }

    @Test
    fun `does not repeat processing effects for a duplicate event`() {
        insertReceivedOrder()
        val command = command(orderId)

        val firstResult = processor.process(command)
        val duplicateResult = processor.process(command)

        assertEquals(ProcessOrderReceivedResult.Processed::class, firstResult::class)
        assertEquals(ProcessOrderReceivedResult.Duplicate, duplicateResult)
        assertEquals(1, dslContext.fetchCount(PROCESSED_MESSAGES))
        assertEquals(1, dslContext.fetchCount(PROCESSING_ATTEMPTS))
        assertEquals(2, dslContext.fetchCount(INTEGRATION_EVENTS))
        assertEquals(1, dslContext.fetchCount(OUTBOX_EVENTS))
        assertEquals("READY", dslContext.selectFrom(ORDERS).fetchSingle().status)
    }

    @Test
    fun `maps and processes an incoming OrderReceived event`() {
        insertReceivedOrder()

        consumer.consume(event())

        assertEquals("READY", dslContext.selectFrom(ORDERS).fetchSingle().status)
        assertEquals(1, dslContext.fetchCount(PROCESSED_MESSAGES))
        assertEquals(1, dslContext.fetchCount(OUTBOX_EVENTS))
    }

    @Test
    fun `rolls back the inbox marker when processing fails`() {
        val command = command(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f99"))

        assertThrows(OrderNotFoundForProcessingException::class.java) {
            processor.process(command)
        }

        assertEquals(0, dslContext.fetchCount(PROCESSED_MESSAGES))
    }

    private fun command(orderId: UUID): ProcessOrderReceivedCommand =
        ProcessOrderReceivedCommand(
            eventId = eventId,
            orderId = OrderId(orderId),
            correlationId = correlationId,
        )

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
            .set(ORDERS.RECEIVED_AT, receivedAt)
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
