package dev.pietrorussod.integrationhub.infrastructure.messaging

import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedCommand
import dev.pietrorussod.integrationhub.domain.order.OrderId
import jakarta.enterprise.context.ApplicationScoped
import java.util.UUID

@ApplicationScoped
class OrderReceivedMessageMapper {
    fun map(event: StructuredEvent): ProcessOrderReceivedCommand {
        validate(event.envelopeVersion == SUPPORTED_ENVELOPE_VERSION) {
            "Unsupported event envelope version: ${event.envelopeVersion}"
        }
        validate(event.eventType == SUPPORTED_EVENT_TYPE) { "Unsupported event type: ${event.eventType}" }
        validate(event.eventVersion == SUPPORTED_EVENT_VERSION) {
            "Unsupported OrderReceived event version: ${event.eventVersion}"
        }
        validate(event.aggregateType == SUPPORTED_AGGREGATE_TYPE) {
            "Unsupported aggregate type: ${event.aggregateType}"
        }
        validate(event.payload.isObject) { "OrderReceived payload must be a JSON object" }

        val payloadOrderId = parseOrderId(event)
        validate(event.aggregateId == payloadOrderId) {
            "Event aggregate ID must match the payload order ID"
        }

        return ProcessOrderReceivedCommand(
            eventId = event.eventId,
            orderId = OrderId(event.aggregateId),
            correlationId = event.correlationId,
        )
    }

    private fun parseOrderId(event: StructuredEvent): UUID {
        val orderIdNode = event.payload["orderId"]
        validate(orderIdNode?.isTextual == true) { "OrderReceived payload orderId must be a UUID string" }
        val value = orderIdNode.textValue()
        val orderId =
            try {
                UUID.fromString(value)
            } catch (exception: IllegalArgumentException) {
                throw InvalidOrderReceivedEventException("OrderReceived payload orderId is invalid", exception)
            }
        validate(orderId.toString() == value) { "OrderReceived payload orderId must be canonical" }
        return orderId
    }

    private fun validate(
        condition: Boolean,
        message: () -> String,
    ) {
        if (!condition) {
            throw InvalidOrderReceivedEventException(message())
        }
    }

    private companion object {
        const val SUPPORTED_ENVELOPE_VERSION = 1
        const val SUPPORTED_EVENT_TYPE = "OrderReceived"
        const val SUPPORTED_EVENT_VERSION = 1
        const val SUPPORTED_AGGREGATE_TYPE = "ORDER"
    }
}
