package dev.pietrorussod.integrationhub.application.operator

interface OperatorOrderReadRepository {
    fun list(query: ListOperatorOrdersQuery): OperatorOrderPage
}
