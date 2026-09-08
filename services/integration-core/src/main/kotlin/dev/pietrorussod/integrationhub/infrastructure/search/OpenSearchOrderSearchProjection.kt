package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjection
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject

@ApplicationScoped
class OpenSearchOrderSearchProjection
    @Inject
    constructor(
        private val documentWriter: OpenSearchOrderSearchDocumentWriter,
        private val indexBootstrap: OpenSearchOrderIndexBootstrap,
    ) : OrderSearchProjection {
        @Volatile
        private var indexReady = false

        private val indexInitializationLock = Any()

        override fun upsert(document: OrderSearchDocument): OrderSearchProjectionWriteOutcome {
            ensureIndexReady()
            return documentWriter.upsert(document, OpenSearchOrderSearchWriteTarget.activeReadAlias())
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
    }
