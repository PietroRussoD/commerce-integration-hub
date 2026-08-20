package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.annotation.JsonFormat
import com.fasterxml.jackson.databind.JsonNode
import java.time.Instant
import java.util.UUID

data class StructuredEvent(
    val envelopeVersion: Int,
    val eventId: UUID,
    val eventType: String,
    val eventVersion: Int,
    val aggregateType: String,
    val aggregateId: UUID,
    val correlationId: UUID,
    @field:JsonFormat(shape = JsonFormat.Shape.STRING)
    val occurredAt: Instant,
    val payload: JsonNode,
)
