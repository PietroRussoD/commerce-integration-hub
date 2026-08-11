package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.time.Clock
import java.util.UUID

class ReceiveOrderUseCase(
    private val orderRepository: OrderRepository,
    private val clock: Clock,
    private val generateOrderId: () -> UUID,
    private val generateOrderItemId: () -> UUID,
) {
    fun receive(command: ReceiveOrderCommand): ReceiveOrderResult {
        val sourceSystem = SourceSystem.from(command.sourceSystem)
        val externalOrderId = ExternalOrderId.from(command.externalOrderId)
        val currency = Currency.from(command.currency)
        val items =
            command.items.mapIndexed { position, item ->
                OrderItem.create(
                    id = generateOrderItemId(),
                    externalLineId = item.externalLineId,
                    sku = item.sku,
                    description = item.description,
                    quantity = item.quantity,
                    unitPrice = Money.of(item.unitPrice, currency),
                    position = position,
                )
            }

        val order =
            Order.receive(
                id = OrderId(generateOrderId()),
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                currency = currency,
                items = items,
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
