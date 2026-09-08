package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexPhase
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexState
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexStateRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject

@ApplicationScoped
class OpenSearchOrderSearchWriteTargetProvider
    @Inject
    constructor(
        private val reindexStateRepository: OrderSearchReindexStateRepository,
    ) {
        fun targets(): List<OpenSearchOrderSearchWriteTarget> = buildTargets(reindexStateRepository.current())

        companion object {
            internal fun buildTargets(state: OrderSearchReindexState): List<OpenSearchOrderSearchWriteTarget> =
                buildList {
                    add(OpenSearchOrderSearchWriteTarget.activeReadAlias())
                    if (state.phase != OrderSearchReindexPhase.IDLE && state.phase != OrderSearchReindexPhase.PREPARING) {
                        add(OpenSearchOrderSearchWriteTarget.candidateIndex(requireNotNull(state.candidateIndex)))
                    }
                }
        }
    }
