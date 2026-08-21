package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedCommand
import dev.pietrorussod.integrationhub.domain.order.OrderId
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import java.util.UUID

@ApplicationScoped
class OrderReceivedMessageMapper
    @Inject
    constructor(
        private val objectMapper: ObjectMapper,
    ) {
        fun map(event: StructuredEvent): ProcessOrderReceivedCommand {
            require(event.envelopeVersion == SUPPORTED_ENVELOPE_VERSION) {
                "Unsupported event envelope version: ${event.envelopeVersion}"
            }
            require(event.eventType == SUPPORTED_EVENT_TYPE) {
                "Unsupported event type: ${event.eventType}"
            }
            require(event.eventVersion == SUPPORTED_EVENT_VERSION) {
                "Unsupported OrderReceived event version: ${event.eventVersion}"
            }
            require(event.aggregateType == SUPPORTED_AGGREGATE_TYPE) {
                "Unsupported aggregate type: ${event.aggregateType}"
            }
            require(event.payload.isObject) { "OrderReceived payload must be a JSON object" }

            val payload = parsePayload(event)
            require(event.aggregateId == payload.orderId) {
                "Event aggregate ID must match the payload order ID"
            }

            return ProcessOrderReceivedCommand(
                eventId = event.eventId,
                orderId = OrderId(event.aggregateId),
                correlationId = event.correlationId,
            )
        }

        private fun parsePayload(event: StructuredEvent): OrderReceivedPayload =
            try {
                objectMapper.treeToValue(event.payload, OrderReceivedPayload::class.java)
            } catch (exception: JsonProcessingException) {
                throw IllegalArgumentException("OrderReceived payload is invalid", exception)
            }

        private data class OrderReceivedPayload(
            val orderId: UUID,
        )

        private companion object {
            const val SUPPORTED_ENVELOPE_VERSION = 1
            const val SUPPORTED_EVENT_TYPE = "OrderReceived"
            const val SUPPORTED_EVENT_VERSION = 1
            const val SUPPORTED_AGGREGATE_TYPE = "ORDER"
        }
    }
