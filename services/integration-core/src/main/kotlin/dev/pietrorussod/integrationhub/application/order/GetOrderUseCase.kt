package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId

class GetOrderUseCase(
    private val orderRepository: OrderRepository,
) {
    fun get(orderId: OrderId): Order? = orderRepository.findById(orderId)
}
