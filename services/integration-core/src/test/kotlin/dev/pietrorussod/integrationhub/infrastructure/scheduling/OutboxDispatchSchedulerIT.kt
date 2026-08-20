package dev.pietrorussod.integrationhub.infrastructure.scheduling

import dev.pietrorussod.integrationhub.infrastructure.messaging.StructuredEvent
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import io.quarkus.test.junit.QuarkusTest
import io.smallrye.reactive.messaging.memory.InMemoryConnector
import jakarta.inject.Inject
import org.eclipse.microprofile.reactive.messaging.spi.Connector
import org.jooq.DSLContext
import org.jooq.JSON
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class OutboxDispatchSchedulerIT {
    @Inject
    lateinit var scheduler: OutboxDispatchScheduler

    @Inject
    lateinit var dslContext: DSLContext

    @Inject
    @Connector("smallrye-in-memory")
    lateinit var connector: InMemoryConnector

    @BeforeEach
    fun resetState() {
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
        connector.sink<StructuredEvent>("integration-events-out").clear()
    }

    @Test
    fun `publishes a pending event and completes its claim`() {
        val eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        insertPendingEvent(eventId)

        scheduler.dispatchPendingEvents()

        val event = dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.eq(eventId)).fetchSingle()
        assertEquals("PUBLISHED", event.status)
        assertEquals(1, event.publishAttempts)
        assertEquals(null, event.claimId)
        assertEquals(1, connector.sink<StructuredEvent>("integration-events-out").received().size)
    }

    private fun insertPendingEvent(eventId: UUID) {
        val now = OffsetDateTime.now(ZoneOffset.UTC)
        val orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")

        dslContext
            .insertInto(OUTBOX_EVENTS)
            .set(OUTBOX_EVENTS.ID, eventId)
            .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "ORDER")
            .set(OUTBOX_EVENTS.AGGREGATE_ID, orderId)
            .set(OUTBOX_EVENTS.EVENT_TYPE, "OrderReceived")
            .set(OUTBOX_EVENTS.EVENT_VERSION, 1)
            .set(OUTBOX_EVENTS.PAYLOAD, JSON.valueOf("{\"orderId\":\"$orderId\"}"))
            .set(OUTBOX_EVENTS.CORRELATION_ID, UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"))
            .set(OUTBOX_EVENTS.CREATED_AT, now.minusSeconds(1))
            .set(OUTBOX_EVENTS.STATUS, "PENDING")
            .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, now.minusSeconds(1))
            .execute()
    }
}
