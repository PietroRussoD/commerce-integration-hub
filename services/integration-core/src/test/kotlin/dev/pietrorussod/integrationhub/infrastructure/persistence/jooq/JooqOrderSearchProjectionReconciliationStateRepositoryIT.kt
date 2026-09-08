package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationBatchResult
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationCompletedRun
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationLease
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationState
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationStateRepository
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchProjectionReconciliationState.Companion.ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

@QuarkusTest
class JooqOrderSearchProjectionReconciliationStateRepositoryIT {
    @Inject
    lateinit var repository: OrderSearchProjectionReconciliationStateRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun resetState() {
        dslContext.deleteFrom(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE).execute()
        dslContext
            .insertInto(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE)
            .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.PROJECTION_NAME, "order-search")
            .execute()
    }

    @Test
    fun `advances and completes reconciliation state with optimistic versioning`() {
        val cursor =
            ReadyOrderSearchDocumentCursor(
                receivedAt = Instant.parse("2026-09-08T08:00:00Z"),
                orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb001"),
            )
        val batch =
            OrderSearchProjectionReconciliationBatchResult(
                scannedCount = 4,
                appliedCount = 3,
                ignoredNonNewerVersionCount = 1,
                nextCursor = cursor,
            )

        assertEquals(initialState(), repository.current())
        val leaseToken = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb000")
        repository.tryAcquireLease("instance-a", leaseToken, Instant.EPOCH, Instant.EPOCH.plusSeconds(30))
        assertTrue(repository.advance(expectedVersion = 0, leaseToken = leaseToken, cursor = cursor, batch = batch))
        assertFalse(repository.advance(expectedVersion = 0, leaseToken = leaseToken, cursor = cursor, batch = batch))

        val advanced = repository.current()
        assertEquals(1, advanced.version)
        assertEquals(cursor, advanced.cursor)
        assertEquals(OrderSearchProjectionReconciliationProgress(4, 3, 1), advanced.currentRun)
        assertEquals(null, advanced.lastCompletedRun)

        val completedAt = Instant.parse("2026-09-08T08:05:00Z")
        assertTrue(repository.complete(expectedVersion = advanced.version, leaseToken = leaseToken, completedAt = completedAt))
        assertFalse(repository.complete(expectedVersion = advanced.version, leaseToken = leaseToken, completedAt = completedAt))

        assertEquals(
            OrderSearchProjectionReconciliationState(
                version = 2,
                cursor = null,
                lease = null,
                currentRun = OrderSearchProjectionReconciliationProgress(0, 0, 0),
                lastCompletedRun =
                    OrderSearchProjectionReconciliationCompletedRun(
                        completedAt = completedAt,
                        progress = OrderSearchProjectionReconciliationProgress(4, 3, 1),
                    ),
            ),
            repository.current(),
        )
    }

    @Test
    fun `acquires an expired lease and releases only its own token`() {
        val acquiredAt = Instant.parse("2026-09-08T08:00:00Z")
        val firstToken = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb101")
        val firstLease =
            requireNotNull(
                repository.tryAcquireLease(
                    owner = "instance-a",
                    token = firstToken,
                    acquiredAt = acquiredAt,
                    expiresAt = acquiredAt.plusSeconds(30),
                ),
            )

        assertEquals(
            OrderSearchProjectionReconciliationLease("instance-a", firstToken, acquiredAt.plusSeconds(30)),
            firstLease.lease,
        )
        assertEquals(
            null,
            repository.tryAcquireLease(
                owner = "instance-b",
                token = UUID.randomUUID(),
                acquiredAt = acquiredAt.plusSeconds(10),
                expiresAt = acquiredAt.plusSeconds(40),
            ),
        )
        assertFalse(repository.releaseLease(UUID.randomUUID()))

        val secondToken = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb102")
        assertEquals(
            secondToken,
            requireNotNull(
                repository.tryAcquireLease(
                    owner = "instance-b",
                    token = secondToken,
                    acquiredAt = acquiredAt.plusSeconds(31),
                    expiresAt = acquiredAt.plusSeconds(61),
                ),
            ).lease?.token,
        )
        assertFalse(repository.releaseLease(firstToken))
        assertTrue(repository.releaseLease(secondToken))
    }

    private fun initialState(): OrderSearchProjectionReconciliationState =
        OrderSearchProjectionReconciliationState(
            version = 0,
            cursor = null,
            lease = null,
            currentRun = OrderSearchProjectionReconciliationProgress(0, 0, 0),
            lastCompletedRun = null,
        )
}
