package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject

@ApplicationScoped
class StructuredEventJsonSerializer
    @Inject
    constructor(
        private val objectMapper: ObjectMapper,
    ) {
        fun serialize(event: OutboundIntegrationEvent): ByteArray {
            val payload = parsePayload(event.payload)
            val envelope = objectMapper.createObjectNode()
            envelope.put("envelopeVersion", event.envelopeVersion)
            envelope.put("eventId", event.eventId.toString())
            envelope.put("eventType", event.eventType)
            envelope.put("eventVersion", event.eventVersion)
            envelope.put("aggregateType", event.aggregateType)
            envelope.put("aggregateId", event.aggregateId.toString())
            envelope.put("correlationId", event.correlationId.toString())
            envelope.put("occurredAt", event.occurredAt.toString())
            envelope.set<JsonNode>("payload", payload)
            return objectMapper.writeValueAsBytes(envelope)
        }

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
