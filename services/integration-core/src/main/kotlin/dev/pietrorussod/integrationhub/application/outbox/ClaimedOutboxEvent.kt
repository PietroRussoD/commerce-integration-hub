package dev.pietrorussod.integrationhub.application.outbox

import java.time.Instant
import java.util.UUID

data class ClaimedOutboxEvent(
    val id: UUID,
    val aggregateType: String,
    val aggregateId: UUID,
    val eventType: String,
    val eventVersion: Int,
    val payload: String,
    val correlationId: UUID,
    val createdAt: Instant,
    val publishAttempts: Int,
)
