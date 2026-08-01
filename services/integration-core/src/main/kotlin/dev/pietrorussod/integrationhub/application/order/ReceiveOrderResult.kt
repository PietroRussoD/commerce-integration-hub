package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Order

data class ReceiveOrderResult(
    val order: Order,
    val outcome: ReceiveOrderOutcome,
)
