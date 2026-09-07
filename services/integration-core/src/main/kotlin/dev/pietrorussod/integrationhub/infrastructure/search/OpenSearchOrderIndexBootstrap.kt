package dev.pietrorussod.integrationhub.infrastructure.search

import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.opensearch._types.OpenSearchException

@ApplicationScoped
class OpenSearchOrderIndexBootstrap
    @Inject
    constructor(
        private val client: OpenSearchClient,
    ) {
        fun ensureReadAlias(): OpenSearchOrderIndexBootstrapOutcome {
            if (readAliasExists()) {
                return OpenSearchOrderIndexBootstrapOutcome.ALREADY_EXISTS
            }

            return try {
                client.indices().create(OpenSearchOrderIndexDefinition.createRequest())
                OpenSearchOrderIndexBootstrapOutcome.CREATED
            } catch (exception: OpenSearchException) {
                if (exception.status() == INDEX_ALREADY_EXISTS_STATUS && readAliasExists()) {
                    OpenSearchOrderIndexBootstrapOutcome.ALREADY_EXISTS
                } else {
                    throw exception
                }
            }
        }

        private fun readAliasExists(): Boolean =
            client
                .indices()
                .existsAlias { request -> request.name(OpenSearchOrderIndexDefinition.READ_ALIAS) }
                .value()

        private companion object {
            const val INDEX_ALREADY_EXISTS_STATUS = 400
        }
    }

enum class OpenSearchOrderIndexBootstrapOutcome {
    CREATED,
    ALREADY_EXISTS,
}
