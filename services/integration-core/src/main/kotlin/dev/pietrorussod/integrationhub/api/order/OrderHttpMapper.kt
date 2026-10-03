package dev.pietrorussod.integrationhub.api.order

import dev.pietrorussod.integrationhub.api.correlation.correlationId
import dev.pietrorussod.integrationhub.api.telemetry.CurrentTraceContext
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderCommand
import dev.pietrorussod.integrationhub.application.order.ReceiveOrderItemCommand
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import jakarta.ws.rs.container.ContainerRequestContext
import java.math.BigDecimal

fun ReceiveOrderRequest.toCommand(
    sourceSystem: SourceSystem,
    requestContext: ContainerRequestContext,
): ReceiveOrderCommand =
    ReceiveOrderCommand(
        sourceSystem = sourceSystem.value,
        correlationId = requestContext.correlationId(),
        externalOrderId = requireNotNull(externalId),
        currency = requireNotNull(currency),
        declaredTotalAmount = BigDecimal(requireNotNull(declaredTotalAmount)),
        traceContext = CurrentTraceContext.capture(),
        items =
            requireNotNull(items).map { item ->
                ReceiveOrderItemCommand(
                    externalLineId = item.externalLineId,
                    sku = requireNotNull(item.sku),
                    description = item.description,
                    quantity = BigDecimal(requireNotNull(item.quantity)),
                    unitPrice = BigDecimal(requireNotNull(item.unitPrice)),
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
