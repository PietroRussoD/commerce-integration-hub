package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class RunOrderSearchReindexUseCaseTest {
    private val clock = Clock.fixed(Instant.parse("2026-09-08T08:00:00Z"), ZoneOffset.UTC)
    private val indices = OrderSearchReindexIndices("orders-v1", "orders-v2")

    @Test
    fun `reserves and prepares a candidate before enabling its writes`() {
        val repository = InMemoryStateRepository()
        val indexManager = RecordingIndexManager(indices)
        val useCase = useCase(repository, indexManager)

        assertEquals(
            OrderSearchReindexRunResult.CandidatePrepared,
            useCase.run("instance-a", Duration.ofSeconds(30), 100),
        )

        assertEquals(listOf("orders-v2"), indexManager.createdCandidates)
        assertEquals(OrderSearchReindexPhase.REBUILDING, repository.current().phase)
        assertFalse(repository.current().lease != null)
    }

    @Test
    fun `advances one candidate rebuild page`() {
        val document = document()
        val repository = InMemoryStateRepository(rebuildingState())
        val indexManager = RecordingIndexManager(indices)
        val reader = RecordingReader(listOf(document))
        val writer = RecordingWriter()
        val useCase = useCase(repository, indexManager, reader, writer)

        assertEquals(
            OrderSearchReindexRunResult.Advanced(
                OrderSearchReindexBatchResult(1, 1, 0, ReadyOrderSearchDocumentCursor(document.receivedAt, document.orderId)),
            ),
            useCase.run("instance-a", Duration.ofSeconds(30), 100),
        )

        assertEquals(listOf(document to "orders-v2"), writer.writes)
        assertEquals(ReadyOrderSearchDocumentCursor(document.receivedAt, document.orderId), repository.current().cursor)
    }

    @Test
    fun `completes an already cut over operation`() {
        val repository = InMemoryStateRepository(readyForCutoverState())
        val indexManager = RecordingIndexManager(indices, OrderSearchReindexCutoverOutcome.ALREADY_CUT_OVER)
        val useCase = useCase(repository, indexManager)

        assertEquals(
            OrderSearchReindexRunResult.Completed(OrderSearchReindexCutoverOutcome.ALREADY_CUT_OVER),
            useCase.run("instance-a", Duration.ofSeconds(30), 100),
        )

        assertEquals(listOf(indices), indexManager.cutOvers)
        assertEquals(OrderSearchReindexPhase.IDLE, repository.current().phase)
    }

    private fun useCase(
        repository: InMemoryStateRepository,
        indexManager: RecordingIndexManager,
        reader: RecordingReader = RecordingReader(emptyList()),
        writer: RecordingWriter = RecordingWriter(),
    ): RunOrderSearchReindexUseCase =
        RunOrderSearchReindexUseCase(
            reindexStateRepository = repository,
            indexManager = indexManager,
            rebuildOrderSearchIndex = RebuildOrderSearchIndexUseCase(reader, writer),
            clock = clock,
        )

    private fun rebuildingState(): OrderSearchReindexState =
        OrderSearchReindexState(
            version = 1,
            phase = OrderSearchReindexPhase.REBUILDING,
            sourceIndex = indices.sourceIndex,
            candidateIndex = indices.candidateIndex,
            cursor = null,
            progress = OrderSearchReindexProgress(0, 0, 0),
            lease = null,
        )

    private fun readyForCutoverState(): OrderSearchReindexState = rebuildingState().copy(phase = OrderSearchReindexPhase.READY_FOR_CUTOVER)

    private fun document(): OrderSearchDocument =
        OrderSearchDocument(
            orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb401"),
            aggregateVersion = 2,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = "ORDER-401",
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("12.50"),
            receivedAt = Instant.parse("2026-09-08T08:00:00Z"),
            readyAt = Instant.parse("2026-09-08T08:01:00Z"),
            items =
                listOf(
                    OrderSearchItem(
                        sku = "SKU-401",
                        description = "Test item",
                        quantity = BigDecimal.ONE,
                        unitPrice = BigDecimal("12.50"),
                        lineAmount = BigDecimal("12.50"),
                        position = 0,
                    ),
                ),
        )

    private class RecordingIndexManager(
        private val indices: OrderSearchReindexIndices,
        private val cutoverOutcome: OrderSearchReindexCutoverOutcome = OrderSearchReindexCutoverOutcome.CUT_OVER,
    ) : OrderSearchReindexIndexManager {
        val createdCandidates = mutableListOf<String>()
        val cutOvers = mutableListOf<OrderSearchReindexIndices>()

        override fun planCandidate(): OrderSearchReindexIndices = indices

        override fun createCandidate(candidateIndex: String) {
            createdCandidates += candidateIndex
        }

        override fun cutOver(indices: OrderSearchReindexIndices): OrderSearchReindexCutoverOutcome {
            cutOvers += indices
            return cutoverOutcome
        }
    }

    private class RecordingReader(
        private val documents: List<OrderSearchDocument>,
    ) : ReadyOrderSearchDocumentReader {
        override fun readPage(
            after: ReadyOrderSearchDocumentCursor?,
            limit: Int,
        ): List<OrderSearchDocument> = documents
    }

    private class RecordingWriter : OrderSearchReindexDocumentWriter {
        val writes = mutableListOf<Pair<OrderSearchDocument, String>>()

        override fun upsert(
            document: OrderSearchDocument,
            candidateIndex: String,
        ): OrderSearchProjectionWriteOutcome {
            writes += document to candidateIndex
            return OrderSearchProjectionWriteOutcome.APPLIED
        }
    }

    private class InMemoryStateRepository(
        initialState: OrderSearchReindexState = idleState(),
    ) : OrderSearchReindexStateRepository {
        private var state = initialState

        override fun current(): OrderSearchReindexState = state

        override fun tryStart(
            sourceIndex: String,
            candidateIndex: String,
            owner: String,
            token: UUID,
            acquiredAt: Instant,
            expiresAt: Instant,
        ): OrderSearchReindexState? {
            if (state.phase != OrderSearchReindexPhase.IDLE) {
                return null
            }
            state =
                state.copy(
                    version = state.version + 1,
                    phase = OrderSearchReindexPhase.PREPARING,
                    sourceIndex = sourceIndex,
                    candidateIndex = candidateIndex,
                    lease = OrderSearchReindexLease(owner, token, expiresAt),
                )
            return state
        }

        override fun tryAcquireLease(
            owner: String,
            token: UUID,
            acquiredAt: Instant,
            expiresAt: Instant,
        ): OrderSearchReindexState? {
            if (state.lease != null) {
                return null
            }
            state = state.copy(lease = OrderSearchReindexLease(owner, token, expiresAt))
            return state
        }

        override fun advance(
            expectedVersion: Long,
            leaseToken: UUID,
            cursor: ReadyOrderSearchDocumentCursor,
            progress: OrderSearchReindexProgress,
        ): Boolean {
            if (!owns(expectedVersion, leaseToken, OrderSearchReindexPhase.REBUILDING)) {
                return false
            }
            state = state.copy(version = state.version + 1, cursor = cursor, progress = progress)
            return true
        }

        override fun markRebuilding(
            expectedVersion: Long,
            leaseToken: UUID,
        ): Boolean {
            if (!owns(expectedVersion, leaseToken, OrderSearchReindexPhase.PREPARING)) {
                return false
            }
            state = state.copy(version = state.version + 1, phase = OrderSearchReindexPhase.REBUILDING)
            return true
        }

        override fun markReadyForCutover(
            expectedVersion: Long,
            leaseToken: UUID,
        ): Boolean {
            if (!owns(expectedVersion, leaseToken, OrderSearchReindexPhase.REBUILDING)) {
                return false
            }
            state = state.copy(version = state.version + 1, phase = OrderSearchReindexPhase.READY_FOR_CUTOVER)
            return true
        }

        override fun completeCutover(
            expectedVersion: Long,
            leaseToken: UUID,
        ): Boolean {
            if (!owns(expectedVersion, leaseToken, OrderSearchReindexPhase.READY_FOR_CUTOVER)) {
                return false
            }
            state = idleState(state.version + 1)
            return true
        }

        override fun releaseLease(token: UUID): Boolean {
            if (state.lease?.token != token) {
                return false
            }
            state = state.copy(lease = null)
            return true
        }

        private fun owns(
            expectedVersion: Long,
            leaseToken: UUID,
            phase: OrderSearchReindexPhase,
        ): Boolean = state.version == expectedVersion && state.phase == phase && state.lease?.token == leaseToken

        private companion object {
            fun idleState(version: Long = 0): OrderSearchReindexState =
                OrderSearchReindexState(
                    version = version,
                    phase = OrderSearchReindexPhase.IDLE,
                    sourceIndex = null,
                    candidateIndex = null,
                    cursor = null,
                    progress = OrderSearchReindexProgress(0, 0, 0),
                    lease = null,
                )
        }
    }
}
