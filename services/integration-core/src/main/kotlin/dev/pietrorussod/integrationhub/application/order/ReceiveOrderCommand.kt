package dev.pietrorussod.integrationhub.application.order

import java.math.BigDecimal
import java.util.UUID

data class ReceiveOrderCommand(
    val sourceSystem: String,
    val correlationId: UUID,
    val externalOrderId: String,
    val currency: String,
    val declaredTotalAmount: BigDecimal,
    val items: List<ReceiveOrderItemCommand>,
)
