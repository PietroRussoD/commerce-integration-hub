package dev.pietrorussod.integrationhub.application.search

import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class SearchOrdersUseCase(
    private val repository: OrderSearchRepository,
) {
    fun search(query: SearchOrdersQuery): OrderSearchPage = repository.search(query)
}
