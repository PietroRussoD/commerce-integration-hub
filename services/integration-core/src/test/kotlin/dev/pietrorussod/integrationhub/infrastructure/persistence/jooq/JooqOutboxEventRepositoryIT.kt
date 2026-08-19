package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.outbox.OutboxEventRepository
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.JSON
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@QuarkusTest
class JooqOutboxEventRepositoryIT {
    private val now = Instant.parse("2026-08-19T08:00:00Z")

    @Inject
    lateinit var repository: OutboxEventRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteOutboxEvents() {
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
    }

    @Test
    fun `claims only due pending events in deterministic order`() {
        val firstId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        val secondId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f62")
        val futureId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f63")
        insertEvent(firstId, createdAt = now.minusSeconds(120), nextAttemptAt = now.minusSeconds(60))
        insertEvent(secondId, createdAt = now.minusSeconds(90), nextAttemptAt = now.minusSeconds(30))
        insertEvent(futureId, createdAt = now.minusSeconds(60), nextAttemptAt = now.plusSeconds(30))

        val claimed = repository.claimPending("publisher-1", now, batchSize = 10)

        assertEquals(listOf(firstId, secondId), claimed.map { it.id })
        assertEquals(listOf(1, 1), claimed.map { it.publishAttempts })
        assertTrue(claimed.all { it.payload.contains(it.id.toString()) })

        val claimedRecords =
            dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.`in`(firstId, secondId)).fetch()
        assertTrue(claimedRecords.all { it.status == "PUBLISHING" })
        assertTrue(claimedRecords.all { it.claimedBy == "publisher-1" })
        assertTrue(claimedRecords.all { it.claimedAt?.toInstant() == now })
        assertEquals(
            "PENDING",
            dslContext
                .selectFrom(OUTBOX_EVENTS)
                .where(OUTBOX_EVENTS.ID.eq(futureId))
                .fetchSingle()
                .status,
        )
    }

    @Test
    fun `respects the requested batch size`() {
        repeat(3) { index ->
            insertEvent(
                id = UUID.nameUUIDFromBytes("event-$index".toByteArray()),
                createdAt = now.minusSeconds((30 - index).toLong()),
                nextAttemptAt = now.minusSeconds(1),
            )
        }

        val claimed = repository.claimPending("publisher-1", now, batchSize = 2)

        assertEquals(2, claimed.size)
        assertEquals(2, dslContext.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.STATUS.eq("PUBLISHING")))
        assertEquals(1, dslContext.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.STATUS.eq("PENDING")))
    }

    @Test
    fun `gives concurrent workers disjoint batches`() {
        repeat(4) { index ->
            insertEvent(
                id = UUID.nameUUIDFromBytes("concurrent-event-$index".toByteArray()),
                createdAt = now.minusSeconds((40 - index).toLong()),
                nextAttemptAt = now.minusSeconds(1),
            )
        }
        val executor = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)

        try {
            val futures =
                listOf("publisher-1", "publisher-2").map { workerId ->
                    executor.submit(
                        Callable {
                            start.await()
                            repository.claimPending(workerId, now, batchSize = 2)
                        },
                    )
                }

            start.countDown()
            val batches = futures.map { it.get(10, TimeUnit.SECONDS) }
            val claimedIds = batches.flatten().map { it.id }

            assertEquals(listOf(2, 2), batches.map { it.size }.sorted())
            assertEquals(4, claimedIds.distinct().size)
            assertEquals(4, dslContext.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.STATUS.eq("PUBLISHING")))
        } finally {
            executor.shutdownNow()
        }
    }

    private fun insertEvent(
        id: UUID,
        createdAt: Instant,
        nextAttemptAt: Instant,
    ) {
        dslContext
            .insertInto(OUTBOX_EVENTS)
            .set(OUTBOX_EVENTS.ID, id)
            .set(OUTBOX_EVENTS.AGGREGATE_TYPE, "ORDER")
            .set(OUTBOX_EVENTS.AGGREGATE_ID, UUID.nameUUIDFromBytes("order-$id".toByteArray()))
            .set(OUTBOX_EVENTS.EVENT_TYPE, "OrderReceived")
            .set(OUTBOX_EVENTS.EVENT_VERSION, 1)
            .set(OUTBOX_EVENTS.PAYLOAD, JSON.valueOf("{\"eventId\":\"$id\"}"))
            .set(OUTBOX_EVENTS.CORRELATION_ID, UUID.nameUUIDFromBytes("correlation-$id".toByteArray()))
            .set(OUTBOX_EVENTS.CREATED_AT, createdAt.atOffset(ZoneOffset.UTC))
            .set(OUTBOX_EVENTS.STATUS, "PENDING")
            .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, nextAttemptAt.atOffset(ZoneOffset.UTC))
            .execute()
    }
}
