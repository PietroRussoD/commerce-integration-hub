package dev.pietrorussod.integrationhub.application.order

data class ReceiveOrderCommand(
    val sourceSystem: String,
    val externalOrderId: String,
    val currency: String,
    val items: List<ReceiveOrderItemCommand>,
)
