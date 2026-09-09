package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationStateRepository
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexIndexManager
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexStateRepository
import dev.pietrorussod.integrationhub.application.search.RebuildOrderSearchIndexUseCase
import dev.pietrorussod.integrationhub.application.search.ReconcileOrderSearchProjectionUseCase
import dev.pietrorussod.integrationhub.application.search.RunOrderSearchProjectionReconciliationUseCase
import dev.pietrorussod.integrationhub.application.search.RunOrderSearchReindexUseCase
import dev.pietrorussod.integrationhub.application.search.ValidateOrderSearchReindexUseCase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock

class SearchApplicationConfiguration {
    @Produces
    @ApplicationScoped
    fun runOrderSearchReindexUseCase(
        reindexStateRepository: OrderSearchReindexStateRepository,
        indexManager: OrderSearchReindexIndexManager,
        rebuildOrderSearchIndex: RebuildOrderSearchIndexUseCase,
        validateOrderSearchReindex: ValidateOrderSearchReindexUseCase,
    ): RunOrderSearchReindexUseCase =
        RunOrderSearchReindexUseCase(
            reindexStateRepository = reindexStateRepository,
            indexManager = indexManager,
            rebuildOrderSearchIndex = rebuildOrderSearchIndex,
            validateOrderSearchReindex = validateOrderSearchReindex,
            clock = Clock.systemUTC(),
        )

    @Produces
    @ApplicationScoped
    fun runOrderSearchProjectionReconciliationUseCase(
        reconciliationStateRepository: OrderSearchProjectionReconciliationStateRepository,
        reconcileOrderSearchProjection: ReconcileOrderSearchProjectionUseCase,
    ): RunOrderSearchProjectionReconciliationUseCase =
        RunOrderSearchProjectionReconciliationUseCase(
            reconciliationStateRepository = reconciliationStateRepository,
            reconcileOrderSearchProjection = reconcileOrderSearchProjection,
            clock = Clock.systemUTC(),
        )
}
