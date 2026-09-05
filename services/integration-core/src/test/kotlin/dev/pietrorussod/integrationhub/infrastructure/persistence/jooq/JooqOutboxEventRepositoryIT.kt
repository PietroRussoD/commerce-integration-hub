package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventRepository
import dev.pietrorussod.integrationhub.application.outbox.PendingOutboxEvent
import dev.pietrorussod.integrationhub.application.outbox.PendingOutboxEventRepository
import dev.pietrorussod.integrationhub.application.processing.OrderReadyEvent
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.JSON
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
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
    private val objectMapper = ObjectMapper()

    @Inject
    lateinit var repository: OutboxEventRepository

    @Inject
    lateinit var pendingEventRepository: PendingOutboxEventRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteOutboxEvents() {
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
    }

    @Test
    fun `appends a pending OrderReady event`() {
        val source = orderReadyEvent()
        val payload = """{"orderId":"${source.order.id.value}","status":"READY"}"""
        val event = PendingOutboxEvent.orderReady(source, payload)

        pendingEventRepository.append(event)

        val record = dslContext.selectFrom(OUTBOX_EVENTS).fetchSingle()
        assertEquals(event.id, record.id)
        assertEquals("ORDER", record.aggregateType)
        assertEquals(event.aggregateId, record.aggregateId)
        assertEquals("OrderReady", record.eventType)
        assertEquals(2, record.eventVersion)
        assertEquals(objectMapper.readTree(payload), objectMapper.readTree(record.payload?.data()))
        assertEquals(event.correlationId, record.correlationId)
        assertEquals(event.createdAt, record.createdAt?.toInstant())
        assertEquals("PENDING", record.status)
        assertEquals(event.createdAt, record.nextAttemptAt?.toInstant())
        assertEquals(0, record.publishAttempts)
        assertEquals(null, record.claimId)
        assertEquals(null, record.claimedBy)
        assertEquals(null, record.claimedAt)
    }

    @Test
    fun `claims only due pending events in deterministic order`() {
        val firstId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        val secondId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f62")
        val futureId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f63")
        val claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70")
        insertEvent(firstId, createdAt = now.minusSeconds(120), nextAttemptAt = now.minusSeconds(60))
        insertEvent(secondId, createdAt = now.minusSeconds(90), nextAttemptAt = now.minusSeconds(30))
        insertEvent(futureId, createdAt = now.minusSeconds(60), nextAttemptAt = now.plusSeconds(30))

        val claimed = repository.claimPending(claimId, "publisher-1", now, batchSize = 10)

        assertEquals(listOf(firstId, secondId), claimed.map { it.id })
        assertTrue(claimed.all { it.claimId == claimId })
        assertTrue(claimed.all { it.workerId == "publisher-1" })
        assertEquals(listOf(1, 1), claimed.map { it.publishAttempts })
        assertTrue(claimed.all { it.payload.contains(it.id.toString()) })

        val claimedRecords =
            dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.`in`(firstId, secondId)).fetch()
        assertTrue(claimedRecords.all { it.status == "PUBLISHING" })
        assertTrue(claimedRecords.all { it.claimId == claimId })
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

        val claimed =
            repository.claimPending(
                UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70"),
                "publisher-1",
                now,
                batchSize = 2,
            )

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
                            repository.claimPending(
                                claimId = UUID.nameUUIDFromBytes("claim-$workerId".toByteArray()),
                                workerId = workerId,
                                claimedAt = now,
                                batchSize = 2,
                            )
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

    @Test
    fun `marks only the exact owned claim as published`() {
        val eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        val claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70")
        insertEvent(eventId, createdAt = now.minusSeconds(10), nextAttemptAt = now.minusSeconds(1))
        repository.claimPending(claimId, "publisher-1", now, batchSize = 1)

        assertFalse(
            repository.markPublished(
                eventId,
                UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f71"),
                "publisher-1",
                now.plusSeconds(1),
            ),
        )
        assertTrue(repository.markPublished(eventId, claimId, "publisher-1", now.plusSeconds(1)))

        val record = dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.eq(eventId)).fetchSingle()
        assertEquals("PUBLISHED", record.status)
        assertEquals(now.plusSeconds(1), record.publishedAt?.toInstant())
        assertEquals(null, record.claimId)
        assertEquals(null, record.claimedBy)
        assertEquals(null, record.claimedAt)
    }

    @Test
    fun `reschedules only the exact owned claim after failure`() {
        val eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        val claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70")
        val nextAttemptAt = now.plusSeconds(30)
        insertEvent(eventId, createdAt = now.minusSeconds(10), nextAttemptAt = now.minusSeconds(1))
        repository.claimPending(claimId, "publisher-1", now, batchSize = 1)

        assertFalse(
            repository.rescheduleAfterFailure(
                eventId,
                claimId,
                "publisher-2",
                nextAttemptAt,
                "BROKER_UNAVAILABLE",
                "Broker unavailable",
            ),
        )
        assertTrue(
            repository.rescheduleAfterFailure(
                eventId,
                claimId,
                "publisher-1",
                nextAttemptAt,
                "BROKER_UNAVAILABLE",
                "Broker unavailable",
            ),
        )

        val record = dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.eq(eventId)).fetchSingle()
        assertEquals("PENDING", record.status)
        assertEquals(nextAttemptAt, record.nextAttemptAt?.toInstant())
        assertEquals("BROKER_UNAVAILABLE", record.lastErrorCode)
        assertEquals("Broker unavailable", record.lastErrorMessage)
        assertEquals(null, record.claimId)
        assertEquals(null, record.claimedBy)
        assertEquals(null, record.claimedAt)
    }

    @Test
    fun `marks only the exact owned claim as terminally failed`() {
        val eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        val claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70")
        val failedAt = now.plusSeconds(1)
        insertEvent(eventId, createdAt = now.minusSeconds(10), nextAttemptAt = now.minusSeconds(1))
        repository.claimPending(claimId, "publisher-1", now, batchSize = 1)

        assertFalse(
            repository.markFailed(
                eventId,
                claimId,
                "publisher-2",
                failedAt,
                "INVALID_EVENT_PAYLOAD",
                "Event payload cannot be published",
            ),
        )
        assertTrue(
            repository.markFailed(
                eventId,
                claimId,
                "publisher-1",
                failedAt,
                "INVALID_EVENT_PAYLOAD",
                "Event payload cannot be published",
            ),
        )

        val record = dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.eq(eventId)).fetchSingle()
        assertEquals("FAILED", record.status)
        assertEquals(failedAt, record.failedAt?.toInstant())
        assertEquals("INVALID_EVENT_PAYLOAD", record.lastErrorCode)
        assertEquals("Event payload cannot be published", record.lastErrorMessage)
        assertEquals(null, record.claimId)
        assertEquals(null, record.claimedBy)
        assertEquals(null, record.claimedAt)
    }

    @Test
    fun `recovers expired claims and fences a late completion`() {
        val expiredId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
        val freshId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f62")
        val oldClaimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70")
        val newClaimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f71")
        insertPublishingEvent(expiredId, oldClaimId, "publisher-1", claimedAt = now.minusSeconds(120))
        insertPublishingEvent(freshId, UUID.randomUUID(), "publisher-2", claimedAt = now.minusSeconds(30))

        val recovered =
            repository.recoverExpiredClaims(
                expiredBefore = now.minusSeconds(60),
                recoveredAt = now,
                batchSize = 10,
            )

        assertEquals(listOf(expiredId), recovered)
        val recoveredRecord =
            dslContext.selectFrom(OUTBOX_EVENTS).where(OUTBOX_EVENTS.ID.eq(expiredId)).fetchSingle()
        assertEquals("PENDING", recoveredRecord.status)
        assertEquals(now, recoveredRecord.nextAttemptAt?.toInstant())
        assertEquals("CLAIM_EXPIRED", recoveredRecord.lastErrorCode)
        assertEquals(null, recoveredRecord.claimId)
        assertEquals(
            "PUBLISHING",
            dslContext
                .selectFrom(OUTBOX_EVENTS)
                .where(OUTBOX_EVENTS.ID.eq(freshId))
                .fetchSingle()
                .status,
        )

        val reclaimed = repository.claimPending(newClaimId, "publisher-1", now, batchSize = 1).single()
        assertEquals(newClaimId, reclaimed.claimId)
        assertFalse(repository.markPublished(expiredId, oldClaimId, "publisher-1", now.plusSeconds(1)))
        assertTrue(repository.markPublished(expiredId, newClaimId, "publisher-1", now.plusSeconds(1)))
    }

    @Test
    fun `gives concurrent recovery workers disjoint batches`() {
        repeat(4) { index ->
            val eventId = UUID.nameUUIDFromBytes("expired-event-$index".toByteArray())
            insertPublishingEvent(
                id = eventId,
                claimId = UUID.nameUUIDFromBytes("expired-claim-$index".toByteArray()),
                workerId = "publisher-$index",
                claimedAt = now.minusSeconds((120 + index).toLong()),
            )
        }
        val executor = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)

        try {
            val futures =
                List(2) {
                    executor.submit(
                        Callable {
                            start.await()
                            repository.recoverExpiredClaims(now.minusSeconds(60), now, batchSize = 2)
                        },
                    )
                }

            start.countDown()
            val batches = futures.map { it.get(10, TimeUnit.SECONDS) }
            val recoveredIds = batches.flatten()

            assertEquals(listOf(2, 2), batches.map { it.size }.sorted())
            assertEquals(4, recoveredIds.distinct().size)
            assertEquals(4, dslContext.fetchCount(OUTBOX_EVENTS, OUTBOX_EVENTS.STATUS.eq("PENDING")))
        } finally {
            executor.shutdownNow()
        }
    }

    private fun insertPublishingEvent(
        id: UUID,
        claimId: UUID,
        workerId: String,
        claimedAt: Instant,
    ) {
        insertEvent(id, createdAt = claimedAt.minusSeconds(10), nextAttemptAt = claimedAt)
        dslContext
            .update(OUTBOX_EVENTS)
            .set(OUTBOX_EVENTS.STATUS, "PUBLISHING")
            .set(OUTBOX_EVENTS.CLAIM_ID, claimId)
            .set(OUTBOX_EVENTS.CLAIMED_BY, workerId)
            .set(OUTBOX_EVENTS.CLAIMED_AT, claimedAt.atOffset(ZoneOffset.UTC))
            .set(OUTBOX_EVENTS.PUBLISH_ATTEMPTS, 1)
            .where(OUTBOX_EVENTS.ID.eq(id))
            .execute()
    }

    private fun orderReadyEvent(): OrderReadyEvent {
        val currency = Currency.EUR
        val item =
            OrderItem.create(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53"),
                externalLineId = "line-1",
                sku = "SKU-1",
                description = "Test item",
                quantity = BigDecimal.ONE,
                unitPrice = Money.of(BigDecimal("19.99"), currency),
                position = 0,
            )
        val order =
            Order
                .receive(
                    id = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")),
                    sourceSystem = SourceSystem.from("marketplace-a"),
                    externalOrderId = ExternalOrderId.from("order-1001"),
                    currency = currency,
                    items = listOf(item),
                    declaredTotalAmount = Money.of(BigDecimal("19.99"), currency),
                    receivedAt = now.minusSeconds(2),
                ).startProcessing()
                .markReady()
        return OrderReadyEvent(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f54"),
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            order = order,
            occurredAt = now,
        )
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
