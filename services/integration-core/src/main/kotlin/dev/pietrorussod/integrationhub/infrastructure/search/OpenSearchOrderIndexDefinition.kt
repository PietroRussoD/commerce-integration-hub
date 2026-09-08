package dev.pietrorussod.integrationhub.infrastructure.search

import org.opensearch.client.opensearch._types.mapping.DynamicMapping
import org.opensearch.client.opensearch._types.mapping.Property
import org.opensearch.client.opensearch.indices.CreateIndexRequest

object OpenSearchOrderIndexDefinition {
    const val INDEX_NAME = "orders-v1"
    const val READ_ALIAS = "orders-read"

    fun createRequest(): CreateIndexRequest =
        createRequest(
            indexName = INDEX_NAME,
            attachReadAlias = true,
        )

    fun createCandidateRequest(indexName: String): CreateIndexRequest {
        require(isVersionedOrderIndex(indexName)) {
            "Order search candidate index must use the orders-vN naming convention"
        }
        require(indexName != INDEX_NAME) {
            "Order search candidate index must differ from the initial index"
        }

        return createRequest(
            indexName = indexName,
            attachReadAlias = false,
        )
    }

    fun isVersionedOrderIndex(indexName: String): Boolean = indexName.matches(VERSIONED_INDEX_NAME)

    fun nextVersionedOrderIndex(indexName: String): String {
        require(isVersionedOrderIndex(indexName)) {
            "Order search index must use the orders-vN naming convention"
        }

        val version = indexName.removePrefix("orders-v").toLong()
        return "orders-v${Math.addExact(version, 1)}"
    }

    private fun createRequest(
        indexName: String,
        attachReadAlias: Boolean,
    ): CreateIndexRequest =
        CreateIndexRequest
            .Builder()
            .index(indexName)
            .settings { settings ->
                settings
                    .numberOfShards(1)
                    .numberOfReplicas(0)
            }.apply {
                if (attachReadAlias) {
                    aliases(READ_ALIAS) { alias -> alias.isWriteIndex(true) }
                }
            }.mappings { mappings ->
                mappings
                    .dynamic(DynamicMapping.Strict)
                    .properties("orderId", keywordProperty())
                    .properties("aggregateVersion", longProperty())
                    .properties("sourceSystem", keywordProperty())
                    .properties("externalOrderId", keywordProperty())
                    .properties("status", keywordProperty())
                    .properties("currency", keywordProperty())
                    .properties("totalAmount", moneyProperty())
                    .properties("receivedAt", dateProperty())
                    .properties("readyAt", dateProperty())
                    .properties("itemSkus", keywordProperty())
                    .properties("itemDescriptions", textProperty())
            }.build()

    private fun keywordProperty(): Property = Property.of { property -> property.keyword { keyword -> keyword } }

    private fun longProperty(): Property = Property.of { property -> property.long_ { number -> number } }

    private fun moneyProperty(): Property = Property.of { property -> property.scaledFloat { number -> number.scalingFactor(100.0) } }

    private fun dateProperty(): Property = Property.of { property -> property.date { date -> date } }

    private fun textProperty(): Property = Property.of { property -> property.text { text -> text } }

    private val VERSIONED_INDEX_NAME = Regex("orders-v[1-9][0-9]*")
}
