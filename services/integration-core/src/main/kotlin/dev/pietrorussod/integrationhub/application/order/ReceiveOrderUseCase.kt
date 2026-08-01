package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.time.Clock
import java.util.UUID

class ReceiveOrderUseCase(
    private val orderRepository: OrderRepository,
    private val clock: Clock,
    private val generateOrderId: () -> UUID,
) {
    fun receive(command: ReceiveOrderCommand): ReceiveOrderResult {
        val sourceSystem = SourceSystem.from(command.sourceSystem)
        val externalOrderId = ExternalOrderId.from(command.externalOrderId)

        val existingOrder = orderRepository.findBySourceIdentity(sourceSystem, externalOrderId)
        if (existingOrder != null) {
            return ReceiveOrderResult(
                order = existingOrder,
                outcome = ReceiveOrderOutcome.ALREADY_RECEIVED,
            )
        }

        val order =
            Order.receive(
                id = OrderId(generateOrderId()),
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                receivedAt = clock.instant(),
            )

        orderRepository.save(order)

        return ReceiveOrderResult(
            order = order,
            outcome = ReceiveOrderOutcome.CREATED,
        )
    }
}
