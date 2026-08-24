package dev.pietrorussod.integrationhub.application.operator

import dev.pietrorussod.integrationhub.domain.order.OrderId

interface OperatorOrderReadRepository {
    fun list(query: ListOperatorOrdersQuery): OperatorOrderPage

    fun findById(orderId: OrderId): OperatorOrderDetail?
}
