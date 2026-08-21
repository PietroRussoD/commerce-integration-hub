package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import java.time.Instant
import java.util.UUID

@ConsistentCopyVisibility
data class OrderTimelineEntry private constructor(
    val id: UUID,
    val orderId: OrderId,
    val eventType: OrderTimelineEventType,
    val fromStatus: OrderStatus,
    val toStatus: OrderStatus,
    val correlationId: UUID,
    val occurredAt: Instant,
) {
    companion object {
        fun processingStarted(
            id: UUID,
            orderId: OrderId,
            correlationId: UUID,
            occurredAt: Instant,
        ): OrderTimelineEntry =
            transition(
                id = id,
                orderId = orderId,
                eventType = OrderTimelineEventType.PROCESSING_STARTED,
                fromStatus = OrderStatus.RECEIVED,
                toStatus = OrderStatus.PROCESSING,
                correlationId = correlationId,
                occurredAt = occurredAt,
            )

        fun processingSucceeded(
            id: UUID,
            orderId: OrderId,
            correlationId: UUID,
            occurredAt: Instant,
        ): OrderTimelineEntry =
            transition(
                id = id,
                orderId = orderId,
                eventType = OrderTimelineEventType.PROCESSING_SUCCEEDED,
                fromStatus = OrderStatus.PROCESSING,
                toStatus = OrderStatus.READY,
                correlationId = correlationId,
                occurredAt = occurredAt,
            )

        private fun transition(
            id: UUID,
            orderId: OrderId,
            eventType: OrderTimelineEventType,
            fromStatus: OrderStatus,
            toStatus: OrderStatus,
            correlationId: UUID,
            occurredAt: Instant,
        ): OrderTimelineEntry =
            OrderTimelineEntry(
                id = id,
                orderId = orderId,
                eventType = eventType,
                fromStatus = fromStatus,
                toStatus = toStatus,
                correlationId = correlationId,
                occurredAt = occurredAt,
            )
    }
}
