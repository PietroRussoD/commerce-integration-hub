package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexPhase
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexStateRepository
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchReindexState.Companion.ORDER_SEARCH_REINDEX_STATE
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

@QuarkusTest
class JooqOrderSearchReindexStateRepositoryIT {
    @Inject
    lateinit var repository: OrderSearchReindexStateRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun resetState() {
        dslContext.deleteFrom(ORDER_SEARCH_REINDEX_STATE).execute()
        dslContext
            .insertInto(ORDER_SEARCH_REINDEX_STATE)
            .set(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME, "order-search")
            .execute()
    }

    @Test
    fun `persists a reindex lifecycle with optimistic versioning`() {
        val startedAt = Instant.parse("2026-09-08T08:00:00Z")
        val leaseToken = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb201")
        val started =
            requireNotNull(
                repository.tryStart(
                    sourceIndex = "orders-v1",
                    candidateIndex = "orders-v2",
                    owner = "instance-a",
                    token = leaseToken,
                    acquiredAt = startedAt,
                    expiresAt = startedAt.plusSeconds(30),
                ),
            )

        assertEquals(1, started.version)
        assertEquals(OrderSearchReindexPhase.PREPARING, started.phase)
        assertEquals("orders-v1", started.sourceIndex)
        assertEquals("orders-v2", started.candidateIndex)

        val cursor =
            ReadyOrderSearchDocumentCursor(
                receivedAt = Instant.parse("2026-09-08T08:01:00Z"),
                orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb202"),
            )
        assertTrue(repository.markRebuilding(started.version, leaseToken))
        val rebuilding = repository.current()
        assertEquals(OrderSearchReindexPhase.REBUILDING, rebuilding.phase)

        assertTrue(
            repository.advance(
                expectedVersion = rebuilding.version,
                leaseToken = leaseToken,
                cursor = cursor,
                progress = OrderSearchReindexProgress(4, 3, 1),
            ),
        )
        assertFalse(
            repository.advance(
                expectedVersion = rebuilding.version,
                leaseToken = leaseToken,
                cursor = cursor,
                progress = OrderSearchReindexProgress(4, 3, 1),
            ),
        )

        val rebuilt = repository.current()
        assertEquals(3, rebuilt.version)
        assertEquals(cursor, rebuilt.cursor)
        assertEquals(OrderSearchReindexProgress(4, 3, 1), rebuilt.progress)
        assertTrue(repository.markReadyForCutover(rebuilt.version, leaseToken))

        val ready = repository.current()
        assertEquals(OrderSearchReindexPhase.READY_FOR_CUTOVER, ready.phase)
        assertTrue(repository.completeCutover(ready.version, leaseToken))

        val completed = repository.current()
        assertEquals(5, completed.version)
        assertEquals(OrderSearchReindexPhase.IDLE, completed.phase)
        assertNull(completed.sourceIndex)
        assertNull(completed.candidateIndex)
        assertNull(completed.cursor)
        assertEquals(OrderSearchReindexProgress(0, 0, 0), completed.progress)
        assertNull(completed.lease)
    }

    @Test
    fun `resumes an active operation only after its lease expires`() {
        val acquiredAt = Instant.parse("2026-09-08T08:00:00Z")
        val firstToken = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb211")
        requireNotNull(
            repository.tryStart(
                sourceIndex = "orders-v1",
                candidateIndex = "orders-v2",
                owner = "instance-a",
                token = firstToken,
                acquiredAt = acquiredAt,
                expiresAt = acquiredAt.plusSeconds(30),
            ),
        )

        assertNull(
            repository.tryAcquireLease(
                owner = "instance-b",
                token = UUID.randomUUID(),
                acquiredAt = acquiredAt.plusSeconds(10),
                expiresAt = acquiredAt.plusSeconds(40),
            ),
        )

        val secondToken = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb212")
        val resumed =
            requireNotNull(
                repository.tryAcquireLease(
                    owner = "instance-b",
                    token = secondToken,
                    acquiredAt = acquiredAt.plusSeconds(31),
                    expiresAt = acquiredAt.plusSeconds(61),
                ),
            )

        assertEquals(secondToken, resumed.lease?.token)
        assertFalse(repository.releaseLease(firstToken))
        assertTrue(repository.releaseLease(secondToken))
    }
}
