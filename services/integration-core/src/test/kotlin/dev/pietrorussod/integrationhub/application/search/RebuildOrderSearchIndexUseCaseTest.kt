package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class RebuildOrderSearchIndexUseCaseTest {
    @Test
    fun `rebuilds one candidate page without writing through the active alias`() {
        val document = document()
        val reader = RecordingReader(listOf(document))
        val writer = RecordingWriter(OrderSearchProjectionWriteOutcome.APPLIED)
        val useCase = RebuildOrderSearchIndexUseCase(reader, writer)

        val result = useCase.rebuild("orders-v2", after = null, batchSize = 100)

        assertEquals(listOf(null to 100), reader.requests)
        assertEquals(listOf(document to "orders-v2"), writer.writes)
        assertEquals(OrderSearchReindexBatchResult(1, 1, 0, ReadyOrderSearchDocumentCursor(document.receivedAt, document.orderId)), result)
    }

    private fun document(): OrderSearchDocument =
        OrderSearchDocument(
            orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fb301"),
            aggregateVersion = 2,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = "ORDER-301",
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("12.50"),
            receivedAt = Instant.parse("2026-09-08T08:00:00Z"),
            readyAt = Instant.parse("2026-09-08T08:01:00Z"),
            items =
                listOf(
                    OrderSearchItem(
                        sku = "SKU-301",
                        description = "Test item",
                        quantity = BigDecimal.ONE,
                        unitPrice = BigDecimal("12.50"),
                        lineAmount = BigDecimal("12.50"),
                        position = 0,
                    ),
                ),
        )

    private class RecordingReader(
        private val documents: List<OrderSearchDocument>,
    ) : ReadyOrderSearchDocumentReader {
        val requests = mutableListOf<Pair<ReadyOrderSearchDocumentCursor?, Int>>()

        override fun readPage(
            after: ReadyOrderSearchDocumentCursor?,
            limit: Int,
        ): List<OrderSearchDocument> {
            requests += after to limit
            return documents
        }
    }

    private class RecordingWriter(
        private val outcome: OrderSearchProjectionWriteOutcome,
    ) : OrderSearchReindexDocumentWriter {
        val writes = mutableListOf<Pair<OrderSearchDocument, String>>()

        override fun upsert(
            document: OrderSearchDocument,
            candidateIndex: String,
        ): OrderSearchProjectionWriteOutcome {
            writes += document to candidateIndex
            return outcome
        }
    }
}
