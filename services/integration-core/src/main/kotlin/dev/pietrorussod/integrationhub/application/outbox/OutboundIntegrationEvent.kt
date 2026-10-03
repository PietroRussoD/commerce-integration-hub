package dev.pietrorussod.integrationhub.application.outbox

import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import java.time.Instant
import java.util.UUID

data class OutboundIntegrationEvent(
    val envelopeVersion: Int,
    val eventId: UUID,
    val eventType: String,
    val eventVersion: Int,
    val aggregateType: String,
    val aggregateId: UUID,
    val correlationId: UUID,
    val occurredAt: Instant,
    val payload: String,
    val traceContext: TraceContext? = null,
)

fun ClaimedOutboxEvent.toOutboundIntegrationEvent(): OutboundIntegrationEvent =
    OutboundIntegrationEvent(
        envelopeVersion = 1,
        eventId = id,
        eventType = eventType,
        eventVersion = eventVersion,
        aggregateType = aggregateType,
        aggregateId = aggregateId,
        correlationId = correlationId,
        occurredAt = createdAt,
        payload = payload,
        traceContext = traceContext,
    )
