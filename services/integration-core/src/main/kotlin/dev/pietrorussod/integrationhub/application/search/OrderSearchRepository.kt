package dev.pietrorussod.integrationhub.application.search

interface OrderSearchRepository {
    // Results are ordered by receipt time descending, then order ID ascending.
    fun search(query: SearchOrdersQuery): OrderSearchPage
}
