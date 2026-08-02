package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Order

data class OrderInsertResult(
    val order: Order,
    val inserted: Boolean,
)
