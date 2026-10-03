package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import dev.pietrorussod.integrationhub.domain.order.Order
import java.time.Instant
import java.util.UUID

data class OrderReceivedEvent(
    val id: UUID,
    val correlationId: UUID,
    val order: Order,
    val occurredAt: Instant,
    val traceContext: TraceContext? = null,
) {
    init {
        require(occurredAt == order.receivedAt) {
            "Order received event time must match the order received time"
        }
    }
}
