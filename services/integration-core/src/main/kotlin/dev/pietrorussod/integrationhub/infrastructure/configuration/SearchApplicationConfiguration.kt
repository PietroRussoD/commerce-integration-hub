package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationStateRepository
import dev.pietrorussod.integrationhub.application.search.ReconcileOrderSearchProjectionUseCase
import dev.pietrorussod.integrationhub.application.search.RunOrderSearchProjectionReconciliationUseCase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock

class SearchApplicationConfiguration {
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
