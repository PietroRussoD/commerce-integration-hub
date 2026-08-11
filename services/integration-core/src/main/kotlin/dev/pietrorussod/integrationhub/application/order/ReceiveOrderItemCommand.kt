package dev.pietrorussod.integrationhub.application.order

import java.math.BigDecimal

data class ReceiveOrderItemCommand(
    val externalLineId: String?,
    val sku: String,
    val description: String?,
    val quantity: BigDecimal,
    val unitPrice: BigDecimal,
)
