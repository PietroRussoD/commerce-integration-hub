package dev.pietrorussod.integrationhub.infrastructure.search

import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.opensearch.indices.UpdateAliasesRequest

@ApplicationScoped
class OpenSearchOrderIndexLifecycle
    @Inject
    constructor(
        private val client: OpenSearchClient,
    ) {
        fun createCandidate(indexName: String) {
            client.indices().create(OpenSearchOrderIndexDefinition.createCandidateRequest(indexName))
        }

        fun cutOver(
            currentIndex: String,
            candidateIndex: String,
        ) {
            client.indices().updateAliases(buildCutOverRequest(currentIndex, candidateIndex))
        }

        companion object {
            internal fun buildCutOverRequest(
                currentIndex: String,
                candidateIndex: String,
            ): UpdateAliasesRequest {
                require(OpenSearchOrderIndexDefinition.isVersionedOrderIndex(currentIndex)) {
                    "Current order search index must use the orders-vN naming convention"
                }
                require(OpenSearchOrderIndexDefinition.isVersionedOrderIndex(candidateIndex)) {
                    "Candidate order search index must use the orders-vN naming convention"
                }
                require(currentIndex != candidateIndex) {
                    "Candidate order search index must differ from the current index"
                }

                return UpdateAliasesRequest
                    .Builder()
                    .actions { action ->
                        action.remove { remove ->
                            remove
                                .index(currentIndex)
                                .alias(OpenSearchOrderIndexDefinition.READ_ALIAS)
                                .mustExist(true)
                        }
                    }.actions { action ->
                        action.add { add ->
                            add
                                .index(candidateIndex)
                                .alias(OpenSearchOrderIndexDefinition.READ_ALIAS)
                                .isWriteIndex(true)
                        }
                    }.build()
            }
        }
    }
