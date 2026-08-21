package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import java.time.Instant
import java.util.UUID

data class OrderReadyEvent(
    val id: UUID,
    val correlationId: UUID,
    val order: Order,
    val occurredAt: Instant,
) {
    init {
        require(order.status == OrderStatus.READY) {
            "Order ready event requires an order in READY status"
        }
        require(!occurredAt.isBefore(order.receivedAt)) {
            "Order ready event time must not precede the order received time"
        }
    }
}
