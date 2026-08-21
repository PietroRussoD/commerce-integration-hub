package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.processing.OrderTimelineEntry
import dev.pietrorussod.integrationhub.application.processing.OrderTimelineRepository
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class JooqOrderTimelineRepositoryIT {
    private val occurredAt = Instant.parse("2026-08-21T08:00:00Z")
    private val correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55")

    @Inject
    lateinit var repository: OrderTimelineRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteData() {
        dslContext.deleteFrom(INTEGRATION_EVENTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `appends processing transitions to the integration event timeline`() {
        val orderId = OrderId(insertOrder())
        val startedEntry =
            OrderTimelineEntry.processingStarted(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
                orderId = orderId,
                correlationId = correlationId,
                occurredAt = occurredAt,
            )
        val succeededEntry =
            OrderTimelineEntry.processingSucceeded(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53"),
                orderId = orderId,
                correlationId = correlationId,
                occurredAt = occurredAt.plusSeconds(1),
            )

        repository.append(startedEntry)
        repository.append(succeededEntry)

        val records =
            dslContext
                .selectFrom(INTEGRATION_EVENTS)
                .orderBy(INTEGRATION_EVENTS.OCCURRED_AT)
                .fetch()
        assertEquals(2, records.size)
        assertEquals("PROCESSING_STARTED", records.first().eventType)
        assertEquals("RECEIVED", records.first().fromStatus)
        assertEquals("PROCESSING", records.first().toStatus)
        assertEquals("PROCESSING_SUCCEEDED", records.last().eventType)
        assertEquals("PROCESSING", records.last().fromStatus)
        assertEquals("READY", records.last().toStatus)
        assertEquals(correlationId, records.first().correlationId)
        assertEquals(occurredAt, records.first().occurredAt?.toInstant())
    }

    private fun insertOrder(): UUID {
        val orderId = UUID.randomUUID()
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, orderId)
            .set(ORDERS.SOURCE_SYSTEM, "repository-test-${UUID.randomUUID()}")
            .set(ORDERS.EXTERNAL_ORDER_ID, "external-${UUID.randomUUID()}")
            .set(ORDERS.STATUS, "RECEIVED")
            .set(ORDERS.CURRENCY, "EUR")
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal.ZERO)
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.RECEIVED_AT, occurredAt.atOffset(ZoneOffset.UTC))
            .execute()
        return orderId
    }
}
