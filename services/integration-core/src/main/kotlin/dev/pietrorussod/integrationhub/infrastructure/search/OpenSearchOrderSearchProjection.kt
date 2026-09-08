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
        private val writeTargetProvider: OpenSearchOrderSearchWriteTargetProvider,
    ) : OrderSearchProjection {
        @Volatile
        private var indexReady = false

        private val indexInitializationLock = Any()

        override fun upsert(document: OrderSearchDocument): OrderSearchProjectionWriteOutcome {
            ensureIndexReady()
            val outcomes = writeTargetProvider.targets().map { target -> documentWriter.upsert(document, target) }
            return outcomes.reduce(::combineOutcomes)
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

        companion object {
            internal fun combineOutcomes(
                first: OrderSearchProjectionWriteOutcome,
                second: OrderSearchProjectionWriteOutcome,
            ): OrderSearchProjectionWriteOutcome =
                if (
                    first == OrderSearchProjectionWriteOutcome.APPLIED ||
                    second == OrderSearchProjectionWriteOutcome.APPLIED
                ) {
                    OrderSearchProjectionWriteOutcome.APPLIED
                } else {
                    OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION
                }
        }
    }
