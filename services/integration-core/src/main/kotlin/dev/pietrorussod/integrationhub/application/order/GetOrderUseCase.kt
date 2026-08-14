package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.SourceSystem

class GetOrderUseCase(
    private val orderRepository: OrderRepository,
) {
    fun get(
        orderId: OrderId,
        sourceSystem: SourceSystem,
    ): Order? = orderRepository.findByIdForSource(orderId, sourceSystem)
}
