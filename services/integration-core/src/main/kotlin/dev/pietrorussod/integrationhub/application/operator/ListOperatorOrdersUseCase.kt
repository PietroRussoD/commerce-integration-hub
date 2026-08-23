package dev.pietrorussod.integrationhub.application.operator

import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class ListOperatorOrdersUseCase(
    private val repository: OperatorOrderReadRepository,
) {
    fun list(query: ListOperatorOrdersQuery): OperatorOrderPage = repository.list(query)
}
