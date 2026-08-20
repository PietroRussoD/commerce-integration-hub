package dev.pietrorussod.integrationhub.infrastructure.scheduling

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.JSON
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class OutboxClaimRecoverySchedulerIT {
    @Inject
    lateinit var scheduler: OutboxClaimRecoveryScheduler

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteOutboxEvents() {
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
    }

    @Test
    fun `recovers only claims older than the configured timeout`() {
        val expiredId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        val activeId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f62")
        insertPublishingEvent(expiredId, claimedAt = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(3))
        insertPublishingEvent(activeId, claimedAt = OffsetDateTime.now(ZoneOffset.UTC).minusMinutes(1))

        scheduler.recoverExpiredClaims()

        val expired = dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.eq(expiredId)).fetchSingle()
        assertEquals("PENDING", expired.status)
        assertEquals("CLAIM_EXPIRED", expired.lastErrorCode)
        assertEquals(null, expired.claimId)
        assertEquals(null, expired.claimedBy)
        assertEquals(
            "PUBLISHING",
            dslContext
                .selectFrom(OUTBOX_EVENTS)
                .where(OUTBOX_EVENTS.ID.eq(activeId))
                .fetchSingle()
                .status,
        )
    }

    private fun insertPublishingEvent(
        eventId: UUID,
        claimedAt: OffsetDateTime,
    ) {
        val orderId = UUID.nameUUIDFromBytes("order-$eventId".toByteArray())

        dslContext
            .insertInto(OUTBOX_EVENTS)
            .set(OUTBOX_EVENTS.ID, eventId)
            .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "ORDER")
            .set(OUTBOX_EVENTS.AGGREGATE_ID, orderId)
            .set(OUTBOX_EVENTS.EVENT_TYPE, "OrderReceived")
            .set(OUTBOX_EVENTS.EVENT_VERSION, 1)
            .set(OUTBOX_EVENTS.PAYLOAD, JSON.valueOf("{\"orderId\":\"$orderId\"}"))
            .set(OUTBOX_EVENTS.CORRELATION_ID, UUID.nameUUIDFromBytes("correlation-$eventId".toByteArray()))
            .set(OUTBOX_EVENTS.CREATED_AT, claimedAt.minusSeconds(1))
            .set(OUTBOX_EVENTS.STATUS, "PUBLISHING")
            .set(OUTBOX_EVENTS.CLAIM_ID, UUID.nameUUIDFromBytes("claim-$eventId".toByteArray()))
            .set(OUTBOX_EVENTS.CLAIMED_BY, "integration-core-test")
            .set(OUTBOX_EVENTS.CLAIMED_AT, claimedAt)
            .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, claimedAt)
            .set(OUTBOX_EVENTS.PUBLISH_ATTEMPTS, 1)
            .execute()
    }
}
