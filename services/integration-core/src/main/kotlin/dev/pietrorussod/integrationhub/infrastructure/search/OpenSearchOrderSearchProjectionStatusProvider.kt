package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionAvailability
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionStatus
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionStatusProvider
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.opensearch._types.OpenSearchException
import java.io.IOException

@ApplicationScoped
class OpenSearchOrderSearchProjectionStatusProvider
    @Inject
    constructor(
        private val client: OpenSearchClient,
        @param:ConfigProperty(name = "mp.messaging.incoming.order-ready-search-in.enabled")
        private val consumerEnabled: Boolean,
    ) : OrderSearchProjectionStatusProvider {
        override fun status(): OrderSearchProjectionStatus =
            OrderSearchProjectionStatus(
                consumerEnabled = consumerEnabled,
                readAlias = OpenSearchOrderIndexDefinition.READ_ALIAS,
                availability = availability(),
            )

        private fun availability(): OrderSearchProjectionAvailability =
            try {
                if (client.indices().existsAlias { request -> request.name(OpenSearchOrderIndexDefinition.READ_ALIAS) }.value()) {
                    OrderSearchProjectionAvailability.AVAILABLE
                } else {
                    OrderSearchProjectionAvailability.NOT_INITIALIZED
                }
            } catch (_: IOException) {
                OrderSearchProjectionAvailability.UNAVAILABLE
            } catch (_: OpenSearchException) {
                OrderSearchProjectionAvailability.UNAVAILABLE
            }
    }
