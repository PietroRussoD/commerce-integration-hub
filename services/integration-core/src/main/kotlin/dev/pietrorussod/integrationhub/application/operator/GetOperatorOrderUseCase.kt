package dev.pietrorussod.integrationhub.application.operator

import dev.pietrorussod.integrationhub.domain.order.OrderId
import jakarta.enterprise.context.ApplicationScoped

@ApplicationScoped
class GetOperatorOrderUseCase(
    private val repository: OperatorOrderReadRepository,
) {
    fun get(orderId: OrderId): OperatorOrderDetail? = repository.findById(orderId)
}
