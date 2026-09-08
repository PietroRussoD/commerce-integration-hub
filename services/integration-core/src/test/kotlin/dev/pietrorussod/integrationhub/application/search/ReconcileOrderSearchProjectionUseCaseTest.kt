package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class ReconcileOrderSearchProjectionUseCaseTest {
    @Test
    fun `projects one bounded authoritative page and returns its continuation cursor`() {
        val first = document("018f38c2-1b95-7cc4-bb89-72d26a6fa001", "2026-09-08T08:00:00Z")
        val second = document("018f38c2-1b95-7cc4-bb89-72d26a6fa002", "2026-09-08T08:01:00Z")
        val reader = RecordingReadyOrderSearchDocumentReader(listOf(first, second))
        val projection =
            RecordingOrderSearchProjection(
                mapOf(
                    first.orderId to OrderSearchProjectionWriteOutcome.APPLIED,
                    second.orderId to OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION,
                ),
            )

        val result = ReconcileOrderSearchProjectionUseCase(reader, projection).reconcile(after = null, batchSize = 25)

        assertEquals(null, reader.requestedCursor)
        assertEquals(25, reader.requestedLimit)
        assertEquals(listOf(first.orderId, second.orderId), projection.projectedOrderIds)
        assertEquals(
            OrderSearchProjectionReconciliationBatchResult(
                scannedCount = 2,
                appliedCount = 1,
                ignoredNonNewerVersionCount = 1,
                nextCursor = ReadyOrderSearchDocumentCursor(second.receivedAt, second.orderId),
            ),
            result,
        )
    }

    @Test
    fun `returns no continuation cursor when the authoritative page is empty`() {
        val reader = RecordingReadyOrderSearchDocumentReader(emptyList())
        val projection = RecordingOrderSearchProjection(emptyMap())
        val cursor =
            ReadyOrderSearchDocumentCursor(
                Instant.parse("2026-09-08T08:00:00Z"),
                UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fa003"),
            )

        val result = ReconcileOrderSearchProjectionUseCase(reader, projection).reconcile(cursor, batchSize = 1)

        assertEquals(cursor, reader.requestedCursor)
        assertEquals(emptyList<UUID>(), projection.projectedOrderIds)
        assertEquals(
            OrderSearchProjectionReconciliationBatchResult(0, 0, 0, null),
            result,
        )
    }

    @Test
    fun `does not return a cursor when a projection write fails`() {
        val document = document("018f38c2-1b95-7cc4-bb89-72d26a6fa004", "2026-09-08T08:00:00Z")
        val reader = RecordingReadyOrderSearchDocumentReader(listOf(document))
        val projection =
            object : OrderSearchProjection {
                override fun upsert(document: OrderSearchDocument): OrderSearchProjectionWriteOutcome = error("OpenSearch is unavailable")
            }

        assertThrows(IllegalStateException::class.java) {
            ReconcileOrderSearchProjectionUseCase(reader, projection).reconcile(after = null, batchSize = 1)
        }
    }

    private fun document(
        id: String,
        receivedAt: String,
    ): OrderSearchDocument =
        OrderSearchDocument(
            orderId = UUID.fromString(id),
            aggregateVersion = 3,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = "ORDER-$id",
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("12.50"),
            receivedAt = Instant.parse(receivedAt),
            readyAt = Instant.parse(receivedAt).plusSeconds(30),
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

    private class RecordingReadyOrderSearchDocumentReader(
        private val documents: List<OrderSearchDocument>,
    ) : ReadyOrderSearchDocumentReader {
        var requestedCursor: ReadyOrderSearchDocumentCursor? = null
        var requestedLimit: Int? = null

        override fun readPage(
            after: ReadyOrderSearchDocumentCursor?,
            limit: Int,
        ): List<OrderSearchDocument> {
            requestedCursor = after
            requestedLimit = limit
            return documents
        }
    }

    private class RecordingOrderSearchProjection(
        private val outcomes: Map<UUID, OrderSearchProjectionWriteOutcome>,
    ) : OrderSearchProjection {
        val projectedOrderIds = mutableListOf<UUID>()

        override fun upsert(document: OrderSearchDocument): OrderSearchProjectionWriteOutcome {
            projectedOrderIds += document.orderId
            return requireNotNull(outcomes[document.orderId])
        }
    }
}
