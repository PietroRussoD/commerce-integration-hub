package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexDocumentCounter
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.opensearch.client.opensearch.OpenSearchClient

@ApplicationScoped
class OpenSearchOrderSearchReindexDocumentCounter
    @Inject
    constructor(
        private val client: OpenSearchClient,
    ) : OrderSearchReindexDocumentCounter {
        override fun countDocuments(candidateIndex: String): Long {
            require(candidateIndex.isNotBlank()) { "Order search reindex candidate index must not be blank" }
            client.indices().refresh { request -> request.index(candidateIndex) }
            return client.count { request -> request.index(candidateIndex) }.count()
        }
    }
