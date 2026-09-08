package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexCutoverOutcome
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexIndexManager
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexIndices
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.opensearch._types.OpenSearchException
import org.opensearch.client.opensearch.indices.UpdateAliasesRequest

@ApplicationScoped
class OpenSearchOrderIndexLifecycle
    @Inject
    constructor(
        private val client: OpenSearchClient,
        private val indexBootstrap: OpenSearchOrderIndexBootstrap,
    ) : OrderSearchReindexIndexManager {
        override fun planCandidate(): OrderSearchReindexIndices {
            indexBootstrap.ensureReadAlias()
            val sourceIndex = activeReadIndex()
            return OrderSearchReindexIndices(
                sourceIndex = sourceIndex,
                candidateIndex = nextAvailableCandidate(sourceIndex, ::indexExists),
            )
        }

        override fun createCandidate(candidateIndex: String) {
            if (indexExists(candidateIndex)) {
                return
            }

            try {
                client.indices().create(OpenSearchOrderIndexDefinition.createCandidateRequest(candidateIndex))
            } catch (exception: OpenSearchException) {
                if (exception.status() != INDEX_ALREADY_EXISTS_STATUS || !indexExists(candidateIndex)) {
                    throw exception
                }
            }
        }

        override fun cutOver(indices: OrderSearchReindexIndices): OrderSearchReindexCutoverOutcome =
            when (activeReadIndex()) {
                indices.candidateIndex -> {
                    OrderSearchReindexCutoverOutcome.ALREADY_CUT_OVER
                }

                indices.sourceIndex -> {
                    client.indices().updateAliases(buildCutOverRequest(indices.sourceIndex, indices.candidateIndex))
                    OrderSearchReindexCutoverOutcome.CUT_OVER
                }

                else -> {
                    error("Order search read alias no longer points to the reindex source or candidate")
                }
            }

        private fun activeReadIndex(): String {
            val indices = client.indices().getAlias { request -> request.name(OpenSearchOrderIndexDefinition.READ_ALIAS) }.result()
            return indices
                .entries
                .singleOrNull { (_, aliases) -> aliases.aliases()[OpenSearchOrderIndexDefinition.READ_ALIAS]?.isWriteIndex() == true }
                ?.key
                ?: error("Order search read alias must resolve to exactly one write index")
        }

        private fun indexExists(indexName: String): Boolean = client.indices().exists { request -> request.index(indexName) }.value()

        companion object {
            internal fun nextAvailableCandidate(
                sourceIndex: String,
                exists: (String) -> Boolean,
            ): String {
                var candidate = OpenSearchOrderIndexDefinition.nextVersionedOrderIndex(sourceIndex)
                while (exists(candidate)) {
                    candidate = OpenSearchOrderIndexDefinition.nextVersionedOrderIndex(candidate)
                }
                return candidate
            }

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

            private const val INDEX_ALREADY_EXISTS_STATUS = 400
        }
    }
