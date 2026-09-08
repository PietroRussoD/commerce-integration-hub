package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.SearchOrdersQuery
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.opensearch.client.opensearch._types.SortOrder
import java.time.Instant

class OpenSearchOrderSearchRepositoryTest {
    @Test
    fun `builds a search request with every supported criterion and stable sorting`() {
        val request =
            OpenSearchOrderSearchRepository.buildRequest(
                SearchOrdersQuery(
                    text = "wireless charger",
                    sourceSystem = SourceSystem.from("marketplace-a"),
                    externalOrderId = ExternalOrderId.from("ORDER-1001"),
                    status = OrderStatus.READY,
                    currency = Currency.EUR,
                    sku = "SKU-1",
                    receivedAtFrom = Instant.parse("2026-09-07T08:00:00Z"),
                    receivedAtBefore = Instant.parse("2026-09-08T08:00:00Z"),
                    limit = 20,
                    offset = 40,
                ),
            )

        assertEquals(listOf(OpenSearchOrderIndexDefinition.READ_ALIAS), request.index())
        assertEquals(20, request.size())
        assertEquals(40, request.from())
        assertTrue(requireNotNull(request.trackTotalHits()).isEnabled)
        assertEquals("receivedAt", request.sort()[0].field().field())
        assertEquals(
            SortOrder.Desc,
            requireNotNull(request.sort()[0].field().order()),
        )
        assertEquals("orderId", request.sort()[1].field().field())
        assertEquals(
            SortOrder.Asc,
            requireNotNull(request.sort()[1].field().order()),
        )

        val bool = requireNotNull(request.query()).bool()
        assertEquals(1, bool.must().size)
        assertEquals("itemDescriptions", bool.must()[0].match().field())
        assertEquals(6, bool.filter().size)
    }

    @Test
    fun `builds a match all query when no criterion is provided`() {
        val request = OpenSearchOrderSearchRepository.buildRequest(defaultQuery())

        assertTrue(requireNotNull(request.query()).isMatchAll)
    }

    private fun defaultQuery(): SearchOrdersQuery =
        SearchOrdersQuery(
            text = null,
            sourceSystem = null,
            externalOrderId = null,
            status = null,
            currency = null,
            sku = null,
            receivedAtFrom = null,
            receivedAtBefore = null,
            limit = 20,
            offset = 0,
        )
}
