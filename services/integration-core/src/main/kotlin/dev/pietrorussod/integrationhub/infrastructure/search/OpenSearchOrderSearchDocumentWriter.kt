package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.opensearch.client.json.JsonData
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.opensearch._types.Result
import org.opensearch.client.opensearch.core.UpdateRequest

@ApplicationScoped
class OpenSearchOrderSearchDocumentWriter
    @Inject
    constructor(
        private val client: OpenSearchClient,
    ) {
        fun upsert(
            document: OrderSearchDocument,
            target: OpenSearchOrderSearchWriteTarget,
        ): OrderSearchProjectionWriteOutcome {
            val result = client.update(buildRequest(document, target), JsonData::class.java).result()
            return when (result) {
                Result.Created,
                Result.Updated,
                -> OrderSearchProjectionWriteOutcome.APPLIED

                Result.NoOp -> OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION

                else -> error("Unexpected OpenSearch update result: $result")
            }
        }

        companion object {
            internal fun buildRequest(
                document: OrderSearchDocument,
                target: OpenSearchOrderSearchWriteTarget,
            ): UpdateRequest<JsonData, JsonData> {
                val source = document.toOpenSearchSource()
                return UpdateRequest
                    .Builder<JsonData, JsonData>()
                    .index(target.index)
                    .id(document.orderId.toString())
                    .requireAlias(target.requireAlias)
                    .retryOnConflict(MAX_CONFLICT_RETRIES)
                    .scriptedUpsert(true)
                    .script { script ->
                        script.inline { inline ->
                            inline
                                .source(VERSIONED_UPSERT_SCRIPT)
                                .params("document", JsonData.of(source))
                                .params("aggregateVersion", JsonData.of(document.aggregateVersion))
                        }
                    }.upsert(JsonData.of(emptyMap<String, Any>()))
                    .build()
            }

            private fun OrderSearchDocument.toOpenSearchSource(): Map<String, Any> =
                mapOf(
                    "orderId" to orderId.toString(),
                    "aggregateVersion" to aggregateVersion,
                    "sourceSystem" to sourceSystem.value,
                    "externalOrderId" to externalOrderId,
                    "status" to status.name,
                    "currency" to currency.name,
                    "totalAmount" to totalAmount,
                    "receivedAt" to receivedAt.toString(),
                    "readyAt" to readyAt.toString(),
                    "itemSkus" to items.map { item -> item.sku },
                    "itemDescriptions" to items.mapNotNull { item -> item.description },
                )

            private const val MAX_CONFLICT_RETRIES = 3

            // The shard compares versions atomically; equal versions are duplicate deliveries.
            private const val VERSIONED_UPSERT_SCRIPT =
                """
                if (ctx._source.aggregateVersion == null || params.aggregateVersion > ctx._source.aggregateVersion) {
                    ctx._source.clear();
                    ctx._source.putAll(params.document);
                } else {
                    ctx.op = 'none';
                }
                """
        }
    }

data class OpenSearchOrderSearchWriteTarget(
    val index: String,
    val requireAlias: Boolean,
) {
    init {
        require(index.isNotBlank()) { "OpenSearch order search write target must not be blank" }
    }

    companion object {
        fun activeReadAlias(): OpenSearchOrderSearchWriteTarget =
            OpenSearchOrderSearchWriteTarget(
                index = OpenSearchOrderIndexDefinition.READ_ALIAS,
                requireAlias = true,
            )

        fun candidateIndex(index: String): OpenSearchOrderSearchWriteTarget =
            OpenSearchOrderSearchWriteTarget(
                index = index,
                requireAlias = false,
            )
    }
}
