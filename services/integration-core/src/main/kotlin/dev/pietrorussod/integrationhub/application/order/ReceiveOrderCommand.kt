package dev.pietrorussod.integrationhub.application.order

import java.math.BigDecimal

data class ReceiveOrderCommand(
    val sourceSystem: String,
    val externalOrderId: String,
    val currency: String,
    val declaredTotalAmount: BigDecimal,
    val items: List<ReceiveOrderItemCommand>,
)
