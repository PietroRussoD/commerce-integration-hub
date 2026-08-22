package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus

sealed class OrderProcessingRejectedException(
    message: String,
) : RuntimeException(message)

class OrderNotFoundForProcessingException(
    orderId: OrderId,
) : OrderProcessingRejectedException("Order ${orderId.value} was not found")

class OrderProcessingStateConflictException(
    orderId: OrderId,
    val expectedStatus: OrderStatus,
) : OrderProcessingRejectedException(
        "Order ${orderId.value} is no longer in ${expectedStatus.name} status",
    )
