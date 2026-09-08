package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchHit
import dev.pietrorussod.integrationhub.application.search.OrderSearchPage
import dev.pietrorussod.integrationhub.application.search.OrderSearchRepository
import dev.pietrorussod.integrationhub.application.search.SearchOrdersQuery
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import jakarta.json.JsonObject
import jakarta.json.JsonString
import org.opensearch.client.json.JsonData
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.opensearch._types.FieldValue
import org.opensearch.client.opensearch._types.SortOrder
import org.opensearch.client.opensearch._types.query_dsl.Query
import org.opensearch.client.opensearch.core.SearchRequest
import org.opensearch.client.opensearch.core.search.Hit
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

@ApplicationScoped
class OpenSearchOrderSearchRepository
    @Inject
    constructor(
        private val client: OpenSearchClient,
        private val indexBootstrap: OpenSearchOrderIndexBootstrap,
    ) : OrderSearchRepository {
        @Volatile
        private var indexReady = false

        private val indexInitializationLock = Any()

        override fun search(query: SearchOrdersQuery): OrderSearchPage {
            ensureIndexReady()

            val response = client.search(buildRequest(query), JsonData::class.java)
            return OrderSearchPage(
                items = response.hits().hits().map(::toSearchHit),
                limit = query.limit,
                offset = query.offset,
                total = requireNotNull(response.hits().total()).value(),
            )
        }

        private fun ensureIndexReady() {
            if (indexReady) {
                return
            }

            synchronized(indexInitializationLock) {
                if (!indexReady) {
                    indexBootstrap.ensureReadAlias()
                    indexReady = true
                }
            }
        }

        private fun toSearchHit(hit: Hit<JsonData>): OrderSearchHit {
            val source = requireNotNull(hit.source()) { "OpenSearch result ${hit.id()} has no source" }.toJson().asJsonObject()
            return OrderSearchHit(
                orderId = UUID.fromString(source.requiredString("orderId")),
                aggregateVersion = source.requiredLong("aggregateVersion"),
                sourceSystem = SourceSystem.from(source.requiredString("sourceSystem")),
                externalOrderId = ExternalOrderId.from(source.requiredString("externalOrderId")),
                status = OrderStatus.valueOf(source.requiredString("status")),
                currency = Currency.valueOf(source.requiredString("currency")),
                totalAmount = source.requiredDecimal("totalAmount"),
                receivedAt = Instant.parse(source.requiredString("receivedAt")),
                readyAt = Instant.parse(source.requiredString("readyAt")),
                itemSkus = source.requiredStringList("itemSkus"),
                itemDescriptions = source.requiredStringList("itemDescriptions"),
            )
        }

        private fun JsonObject.requiredString(name: String): String = getString(name)

        private fun JsonObject.requiredLong(name: String): Long = getJsonNumber(name).longValue()

        private fun JsonObject.requiredDecimal(name: String): BigDecimal = getJsonNumber(name).bigDecimalValue()

        private fun JsonObject.requiredStringList(name: String): List<String> =
            getJsonArray(name).map { value -> (value as JsonString).string }

        companion object {
            internal fun buildRequest(query: SearchOrdersQuery): SearchRequest {
                val filters = query.filters()
                val searchQuery = query.text?.let(::descriptionMatchQuery)
                val rootQuery =
                    if (searchQuery == null && filters.isEmpty()) {
                        Query.of { root -> root.matchAll { matchAll -> matchAll } }
                    } else {
                        Query.of { root ->
                            root.bool { bool ->
                                searchQuery?.let { bool.must(it) }
                                filters.forEach { filter -> bool.filter(filter) }
                                bool
                            }
                        }
                    }

                return SearchRequest
                    .Builder()
                    .index(OpenSearchOrderIndexDefinition.READ_ALIAS)
                    .from(query.offset)
                    .size(query.limit)
                    .trackTotalHits { trackHits -> trackHits.enabled(true) }
                    .sort { sort -> sort.field { field -> field.field("receivedAt").order(SortOrder.Desc) } }
                    .sort { sort -> sort.field { field -> field.field("orderId").order(SortOrder.Asc) } }
                    .query(rootQuery)
                    .build()
            }

            private fun SearchOrdersQuery.filters(): List<Query> =
                buildList {
                    sourceSystem?.let { add(termQuery("sourceSystem", it.value)) }
                    externalOrderId?.let { add(termQuery("externalOrderId", it.value)) }
                    status?.let { add(termQuery("status", it.name)) }
                    currency?.let { add(termQuery("currency", it.name)) }
                    sku?.let { add(termQuery("itemSkus", it)) }
                    if (receivedAtFrom != null || receivedAtBefore != null) {
                        add(receiptTimeRangeQuery(receivedAtFrom, receivedAtBefore))
                    }
                }

            private fun termQuery(
                field: String,
                value: String,
            ): Query =
                Query.of { root ->
                    root.term { term -> term.field(field).value(FieldValue.of(value)) }
                }

            private fun descriptionMatchQuery(text: String): Query =
                Query.of { root ->
                    root.match { match -> match.field("itemDescriptions").query(FieldValue.of(text)) }
                }

            private fun receiptTimeRangeQuery(
                from: Instant?,
                before: Instant?,
            ): Query =
                Query.of { root ->
                    root.range { range ->
                        range.field("receivedAt")
                        from?.let { range.gte(JsonData.of(it.toString())) }
                        before?.let { range.lt(JsonData.of(it.toString())) }
                        range
                    }
                }
        }
    }
