package dev.pietrorussod.integrationhub.application.search

import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class GetOrderSearchProjectionStatusUseCase(
    private val statusProvider: OrderSearchProjectionStatusProvider,
) {
    fun get(): OrderSearchProjectionStatus = statusProvider.status()
}
