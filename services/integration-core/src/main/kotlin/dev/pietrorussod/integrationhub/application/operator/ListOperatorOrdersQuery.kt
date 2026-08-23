package dev.pietrorussod.integrationhub.application.operator

import dev.pietrorussod.integrationhub.domain.order.OrderStatus

data class ListOperatorOrdersQuery(
    val status: OrderStatus?,
    val limit: Int,
    val offset: Int,
)
