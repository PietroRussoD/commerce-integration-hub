package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject

@ApplicationScoped
class StructuredEventMapper
    @Inject
    constructor(
        private val objectMapper: ObjectMapper,
    ) {
        fun map(event: OutboundIntegrationEvent): StructuredEvent =
            StructuredEvent(
                envelopeVersion = event.envelopeVersion,
                eventId = event.eventId,
                eventType = event.eventType,
                eventVersion = event.eventVersion,
                aggregateType = event.aggregateType,
                aggregateId = event.aggregateId,
                correlationId = event.correlationId,
                occurredAt = event.occurredAt,
                payload = parsePayload(event.payload),
            )

        private fun parsePayload(payload: String): JsonNode {
            val parsed =
                try {
                    requireNotNull(objectMapper.readTree(payload))
                } catch (exception: JsonProcessingException) {
                    throw IllegalArgumentException("Outbound event payload must contain valid JSON", exception)
                }
            require(parsed.isObject) { "Outbound event payload must be a JSON object" }
            return parsed
        }
    }
