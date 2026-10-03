package dev.pietrorussod.integrationhub.application.outbox

import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import java.time.Instant
import java.util.UUID

data class ClaimedOutboxEvent(
    val id: UUID,
    val claimId: UUID,
    val workerId: String,
    val aggregateType: String,
    val aggregateId: UUID,
    val eventType: String,
    val eventVersion: Int,
    val payload: String,
    val correlationId: UUID,
    val createdAt: Instant,
    val publishAttempts: Int,
    val traceContext: TraceContext? = null,
)
