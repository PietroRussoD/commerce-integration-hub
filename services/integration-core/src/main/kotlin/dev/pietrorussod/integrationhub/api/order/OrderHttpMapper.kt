package dev.pietrorussod.integrationhub.api.order

import dev.pietrorussod.integrationhub.application.order.ReceiveOrderCommand
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderItemCommand
import dev.pietrorussod.integrationhub.domain.order.Order
import java.math.BigDecimal

fun ReceiveOrderRequest.toCommand(): ReceiveOrderCommand =
    ReceiveOrderCommand(
        sourceSystem = sourceSystem,
        externalOrderId = externalId,
        currency = currency,
        declaredTotalAmount = BigDecimal(declaredTotalAmount),
        items =
            items.map { item ->
                ReceiveOrderItemCommand(
                    externalLineId = item.externalLineId,
                    sku = item.sku,
                    description = item.description,
                    quantity = BigDecimal(item.quantity),
                    unitPrice = BigDecimal(item.unitPrice),
                )
            },
    )

fun Order.toResponse(): OrderResponse =
    OrderResponse(
        id = id.value,
        sourceSystem = sourceSystem.value,
        externalId = externalOrderId.value,
        currency = currency.name,
        totalAmount = totalAmount.amount.toPlainString(),
        status = status.name,
        receivedAt = receivedAt,
        items =
            items.map { item ->
                OrderItemResponse(
                    externalLineId = item.externalLineId,
                    sku = item.sku,
                    description = item.description,
                    quantity = item.quantity.toPlainString(),
                    unitPrice = item.unitPrice.amount.toPlainString(),
                    lineAmount = item.lineAmount.amount.toPlainString(),
                )
            },
    )
