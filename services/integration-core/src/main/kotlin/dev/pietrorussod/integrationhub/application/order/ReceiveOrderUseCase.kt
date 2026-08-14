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
    private val payloadFingerprinter: CanonicalOrderPayloadFingerprinter,
    private val clock: Clock,
    private val generateOrderId: () -> UUID,
    private val generateOrderItemId: () -> UUID,
    private val generateEventId: () -> UUID,
) {
    fun receive(command: ReceiveOrderCommand): ReceiveOrderResult {
        val order =
            try {
                createOrder(command)
            } catch (exception: IllegalArgumentException) {
                throw InvalidReceiveOrderCommandException(exception)
            }

        val payloadFingerprint = payloadFingerprinter.fingerprint(order)
        val event =
            OrderReceivedEvent(
                id = generateEventId(),
                correlationId = command.correlationId,
                order = order,
                occurredAt = order.receivedAt,
            )
        val insertResult = orderRepository.insertIfAbsent(event, payloadFingerprint)

        return ReceiveOrderResult(
            order = insertResult.order,
            outcome =
                when (insertResult.outcome) {
                    OrderInsertOutcome.INSERTED -> ReceiveOrderOutcome.CREATED
                    OrderInsertOutcome.EQUIVALENT_REPLAY -> ReceiveOrderOutcome.ALREADY_RECEIVED
                    OrderInsertOutcome.PAYLOAD_CONFLICT -> ReceiveOrderOutcome.PAYLOAD_CONFLICT
                },
        )
    }

    private fun createOrder(command: ReceiveOrderCommand): Order {
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

        return Order.receive(
            id = OrderId(generateOrderId()),
            sourceSystem = sourceSystem,
            externalOrderId = externalOrderId,
            currency = currency,
            items = items,
            declaredTotalAmount = Money.of(command.declaredTotalAmount, currency),
            receivedAt = clock.instant(),
        )
    }
}
