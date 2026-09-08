package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchItem
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

class OpenSearchOrderSearchDocumentWriterTest {
    private val document =
        OrderSearchDocument(
            orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6fa001"),
            aggregateVersion = 3,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = "ORDER-42",
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("12.50"),
            receivedAt = Instant.parse("2026-09-08T08:00:00Z"),
            readyAt = Instant.parse("2026-09-08T08:00:30Z"),
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

    @Test
    fun `builds an alias-protected versioned upsert for the active projection`() {
        val request =
            OpenSearchOrderSearchDocumentWriter.buildRequest(
                document,
                OpenSearchOrderSearchWriteTarget.activeReadAlias(),
            )

        assertEquals(OpenSearchOrderIndexDefinition.READ_ALIAS, request.index())
        assertEquals(document.orderId.toString(), request.id())
        assertEquals(true, request.requireAlias())
        assertEquals(3, request.retryOnConflict())
        assertEquals(true, request.scriptedUpsert())
    }

    @Test
    fun `builds a direct versioned upsert for a candidate index`() {
        val request =
            OpenSearchOrderSearchDocumentWriter.buildRequest(
                document,
                OpenSearchOrderSearchWriteTarget.candidateIndex("orders-v2"),
            )

        assertEquals("orders-v2", request.index())
        assertEquals(false, request.requireAlias())
        assertEquals(3, request.retryOnConflict())
        assertEquals(true, request.scriptedUpsert())
    }
}
