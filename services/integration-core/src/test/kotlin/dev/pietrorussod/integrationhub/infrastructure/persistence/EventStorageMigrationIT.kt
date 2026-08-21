package dev.pietrorussod.integrationhub.infrastructure.persistence

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.JSON
import org.jooq.exception.DataAccessException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class EventStorageMigrationIT {
    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteData() {
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `stores an integration event and pending outbox event`() {
        val orderId = insertOrder()
        val eventId = UUID.randomUUID()
        val correlationId = UUID.randomUUID()
        val occurredAt = OffsetDateTime.now(ZoneOffset.UTC)

        dslContext
            .insertInto(INTEGRATION_EVENTS)
            .set(INTEGRATION_EVENTS.ID, eventId)
            .set(INTEGRATION_EVENTS.ORDER_ID, orderId)
            .set(INTEGRATION_EVENTS.EVENT_TYPE, "ORDER_RECEIVED")
            .set(INTEGRATION_EVENTS.TO_STATUS, "RECEIVED")
            .set(INTEGRATION_EVENTS.CORRELATION_ID, correlationId)
            .set(INTEGRATION_EVENTS.OCCURRED_AT, occurredAt)
            .execute()

        dslContext
            .insertInto(OUTBOX_EVENTS)
            .set(OUTBOX_EVENTS.ID, eventId)
            .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "ORDER")
            .set(OUTBOX_EVENTS.AGGREGATE_ID, orderId)
            .set(OUTBOX_EVENTS.EVENT_TYPE, "OrderReceived")
            .set(OUTBOX_EVENTS.EVENT_VERSION, 1)
            .set(OUTBOX_EVENTS.PAYLOAD, JSON.valueOf("{\"orderId\":\"$orderId\"}"))
            .set(OUTBOX_EVENTS.CORRELATION_ID, correlationId)
            .set(OUTBOX_EVENTS.CREATED_AT, occurredAt)
            .set(OUTBOX_EVENTS.STATUS, "PENDING")
            .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, occurredAt)
            .execute()

        assertEquals(1, dslContext.fetchCount(INTEGRATION_EVENTS))
        assertEquals(1, dslContext.fetchCount(OUTBOX_EVENTS))
    }

    @Test
    fun `stores processing timeline transitions`() {
        val orderId = insertOrder()
        val correlationId = UUID.randomUUID()
        val occurredAt = OffsetDateTime.now(ZoneOffset.UTC)

        insertIntegrationEvent(
            orderId = orderId,
            eventType = "PROCESSING_STARTED",
            fromStatus = "RECEIVED",
            toStatus = "PROCESSING",
            correlationId = correlationId,
            occurredAt = occurredAt,
        )
        insertIntegrationEvent(
            orderId = orderId,
            eventType = "PROCESSING_SUCCEEDED",
            fromStatus = "PROCESSING",
            toStatus = "READY",
            correlationId = correlationId,
            occurredAt = occurredAt.plusSeconds(1),
        )

        assertEquals(2, dslContext.fetchCount(INTEGRATION_EVENTS))
    }

    @Test
    fun `rejects inconsistent outbox claim state`() {
        val orderId = insertOrder()
        val occurredAt = OffsetDateTime.now(ZoneOffset.UTC)

        assertThrows(DataAccessException::class.java) {
            dslContext
                .insertInto(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.ID, UUID.randomUUID())
                .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "ORDER")
                .set(OUTBOX_EVENTS.AGGREGATE_ID, orderId)
                .set(OUTBOX_EVENTS.EVENT_TYPE, "OrderReceived")
                .set(OUTBOX_EVENTS.EVENT_VERSION, 1)
                .set(OUTBOX_EVENTS.PAYLOAD, JSON.valueOf("{}"))
                .set(OUTBOX_EVENTS.CORRELATION_ID, UUID.randomUUID())
                .set(OUTBOX_EVENTS.CREATED_AT, occurredAt)
                .set(OUTBOX_EVENTS.STATUS, "PUBLISHING")
                .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, occurredAt)
                .execute()
        }
    }

    @Test
    fun `creates the expired claim recovery index`() {
        val indexDefinition =
            requireNotNull(
                dslContext.fetchOne(
                    """
                    SELECT indexdef
                    FROM pg_indexes
                    WHERE schemaname = 'public'
                      AND indexname = 'outbox_events_expired_claim_idx'
                    """.trimIndent(),
                ),
            ).get("indexdef", String::class.java)

        assertTrue(requireNotNull(indexDefinition).contains("(claimed_at, id)"))
        assertTrue(indexDefinition.contains("status"))
        assertTrue(indexDefinition.contains("PUBLISHING"))
    }

    @Test
    fun `rejects inconsistent terminal outbox failure state`() {
        val eventId = insertPendingOutbox(insertOrder())
        val failedAt = OffsetDateTime.now(ZoneOffset.UTC)

        assertThrows(DataAccessException::class.java) {
            dslContext
                .update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.STATUS, "FAILED")
                .where(OUTBOX_EVENTS.ID.eq(eventId))
                .execute()
        }
        assertThrows(DataAccessException::class.java) {
            dslContext
                .update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.FAILED_AT, failedAt)
                .where(OUTBOX_EVENTS.ID.eq(eventId))
                .execute()
        }
    }

    private fun insertPendingOutbox(orderId: UUID): UUID {
        val eventId = UUID.randomUUID()
        val occurredAt = OffsetDateTime.now(ZoneOffset.UTC)
        dslContext
            .insertInto(OUTBOX_EVENTS)
            .set(OUTBOX_EVENTS.ID, eventId)
            .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "ORDER")
            .set(OUTBOX_EVENTS.AGGREGATE_ID, orderId)
            .set(OUTBOX_EVENTS.EVENT_TYPE, "OrderReceived")
            .set(OUTBOX_EVENTS.EVENT_VERSION, 1)
            .set(OUTBOX_EVENTS.PAYLOAD, JSON.valueOf("{}"))
            .set(OUTBOX_EVENTS.CORRELATION_ID, UUID.randomUUID())
            .set(OUTBOX_EVENTS.CREATED_AT, occurredAt)
            .set(OUTBOX_EVENTS.STATUS, "PENDING")
            .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, occurredAt)
            .execute()
        return eventId
    }

    private fun insertIntegrationEvent(
        orderId: UUID,
        eventType: String,
        fromStatus: String,
        toStatus: String,
        correlationId: UUID,
        occurredAt: OffsetDateTime,
    ) {
        dslContext
            .insertInto(INTEGRATION_EVENTS)
            .set(INTEGRATION_EVENTS.ID, UUID.randomUUID())
            .set(INTEGRATION_EVENTS.ORDER_ID, orderId)
            .set(INTEGRATION_EVENTS.EVENT_TYPE, eventType)
            .set(INTEGRATION_EVENTS.FROM_STATUS, fromStatus)
            .set(INTEGRATION_EVENTS.TO_STATUS, toStatus)
            .set(INTEGRATION_EVENTS.CORRELATION_ID, correlationId)
            .set(INTEGRATION_EVENTS.OCCURRED_AT, occurredAt)
            .execute()
    }

    private fun insertOrder(): UUID {
        val orderId = UUID.randomUUID()
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, orderId)
            .set(ORDERS.SOURCE_SYSTEM, "migration-test-${UUID.randomUUID()}")
            .set(ORDERS.EXTERNAL_ORDER_ID, "external-${UUID.randomUUID()}")
            .set(ORDERS.STATUS, "RECEIVED")
            .set(ORDERS.CURRENCY, "EUR")
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal.ZERO)
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.RECEIVED_AT, OffsetDateTime.now(ZoneOffset.UTC))
            .execute()
        return orderId
    }
}
