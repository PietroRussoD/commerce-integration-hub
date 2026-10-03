package dev.pietrorussod.integrationhub.application.outbox

import dev.pietrorussod.integrationhub.application.processing.OrderReadyEvent
import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import java.time.Instant
import java.util.UUID

@ConsistentCopyVisibility
data class PendingOutboxEvent private constructor(
    val id: UUID,
    val aggregateType: String,
    val aggregateId: UUID,
    val eventType: String,
    val eventVersion: Int,
    val payload: String,
    val correlationId: UUID,
    val createdAt: Instant,
    val traceContext: TraceContext?,
) {
    companion object {
        fun orderReady(
            event: OrderReadyEvent,
            payload: String,
            traceContext: TraceContext? = null,
        ): PendingOutboxEvent {
            require(payload.isNotBlank()) { "OrderReady outbox payload must not be blank" }

            return PendingOutboxEvent(
                id = event.id,
                aggregateType = "ORDER",
                aggregateId = event.order.id.value,
                eventType = "OrderReady",
                eventVersion = 2,
                payload = payload,
                correlationId = event.correlationId,
                createdAt = event.occurredAt,
                traceContext = traceContext,
            )
        }
    }
}
