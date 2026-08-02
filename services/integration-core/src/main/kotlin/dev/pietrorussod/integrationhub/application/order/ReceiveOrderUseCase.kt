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

        val order =
            Order.receive(
                id = OrderId(generateOrderId()),
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                receivedAt = clock.instant(),
            )

        val insertResult = orderRepository.insertIfAbsent(order)

        return ReceiveOrderResult(
            order = insertResult.order,
            outcome =
                if (insertResult.inserted) {
                    ReceiveOrderOutcome.CREATED
                } else {
                    ReceiveOrderOutcome.ALREADY_RECEIVED
                },
        )
    }
}
