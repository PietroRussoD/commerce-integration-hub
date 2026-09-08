package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class RunOrderSearchProjectionReconciliationUseCaseTest {
    private val now = Instant.parse("2026-09-08T08:05:00Z")

    @Test
    fun `advances the durable checkpoint after a non-empty batch`() {
        val document = document("018f38c2-1b95-7cc4-bb89-72d26a6fc001")
        val state = state(version = 4)
        val stateRepository = RecordingStateRepository(state)
        val useCase = useCase(stateRepository, listOf(document))

        val result = useCase.run(batchSize = 25)

        assertEquals(
            OrderSearchProjectionReconciliationRunResult.Advanced(
                OrderSearchProjectionReconciliationBatchResult(1, 1, 0, cursor(document)),
            ),
            result,
        )
        assertEquals(4, stateRepository.advanceExpectedVersion)
        assertEquals(cursor(document), stateRepository.advancedCursor)
        assertEquals(null, stateRepository.completedExpectedVersion)
    }

    @Test
    fun `completes the durable run after an empty batch`() {
        val stateRepository = RecordingStateRepository(state(version = 5))
        val useCase = useCase(stateRepository, emptyList())

        val result = useCase.run(batchSize = 25)

        assertEquals(OrderSearchProjectionReconciliationRunResult.Completed, result)
        assertEquals(5, stateRepository.completedExpectedVersion)
        assertEquals(now, stateRepository.completedAt)
    }

    @Test
    fun `reports a state change when a concurrent worker wins the checkpoint update`() {
        val document = document("018f38c2-1b95-7cc4-bb89-72d26a6fc002")
        val stateRepository = RecordingStateRepository(state(version = 6), advanceResult = false)

        val result = useCase(stateRepository, listOf(document)).run(batchSize = 25)

        assertEquals(OrderSearchProjectionReconciliationRunResult.StateChanged, result)
    }

    private fun useCase(
        stateRepository: RecordingStateRepository,
        documents: List<OrderSearchDocument>,
    ): RunOrderSearchProjectionReconciliationUseCase =
        RunOrderSearchProjectionReconciliationUseCase(
            reconciliationStateRepository = stateRepository,
            reconcileOrderSearchProjection =
                ReconcileOrderSearchProjectionUseCase(
                    readyOrderSearchDocumentReader =
                        object : ReadyOrderSearchDocumentReader {
                            override fun readPage(
                                after: ReadyOrderSearchDocumentCursor?,
                                limit: Int,
                            ): List<OrderSearchDocument> = documents
                        },
                    projection =
                        object : OrderSearchProjection {
                            override fun upsert(document: OrderSearchDocument): OrderSearchProjectionWriteOutcome =
                                OrderSearchProjectionWriteOutcome.APPLIED
                        },
                ),
            clock = Clock.fixed(now, ZoneOffset.UTC),
        )

    private fun state(version: Long): OrderSearchProjectionReconciliationState =
        OrderSearchProjectionReconciliationState(
            version = version,
            cursor = null,
            lease = null,
            currentRun = OrderSearchProjectionReconciliationProgress(0, 0, 0),
            lastCompletedRun = null,
        )

    private fun document(id: String): OrderSearchDocument =
        OrderSearchDocument(
            orderId = UUID.fromString(id),
            aggregateVersion = 3,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = "ORDER-$id",
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("12.50"),
            receivedAt = Instant.parse("2026-09-08T08:00:00Z"),
            readyAt = Instant.parse("2026-09-08T08:01:00Z"),
            items =
                listOf(
                    OrderSearchItem(
                        sku = "SKU-1",
                        description = "Test item",
                        quantity = BigDecimal.ONE,
                        unitPrice = BigDecimal("12.50"),
                        lineAmount = BigDecimal("12.50"),
                        position = 0,
                    ),
                ),
        )

    private fun cursor(document: OrderSearchDocument): ReadyOrderSearchDocumentCursor =
        ReadyOrderSearchDocumentCursor(document.receivedAt, document.orderId)

    private class RecordingStateRepository(
        private val state: OrderSearchProjectionReconciliationState,
        private val advanceResult: Boolean = true,
        private val completeResult: Boolean = true,
    ) : OrderSearchProjectionReconciliationStateRepository {
        var advanceExpectedVersion: Long? = null
        var advancedCursor: ReadyOrderSearchDocumentCursor? = null
        var completedExpectedVersion: Long? = null
        var completedAt: Instant? = null

        override fun current(): OrderSearchProjectionReconciliationState = state

        override fun tryAcquireLease(
            owner: String,
            token: UUID,
            acquiredAt: Instant,
            expiresAt: Instant,
        ): OrderSearchProjectionReconciliationState? = error("Not used")

        override fun releaseLease(token: UUID): Boolean = error("Not used")

        override fun advance(
            expectedVersion: Long,
            cursor: ReadyOrderSearchDocumentCursor,
            batch: OrderSearchProjectionReconciliationBatchResult,
        ): Boolean {
            advanceExpectedVersion = expectedVersion
            advancedCursor = cursor
            return advanceResult
        }

        override fun complete(
            expectedVersion: Long,
            completedAt: Instant,
        ): Boolean {
            completedExpectedVersion = expectedVersion
            this.completedAt = completedAt
            return completeResult
        }
    }
}
