package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.core.JsonProcessingException
import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchItem
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject

@ApplicationScoped
class OrderReadyMessageMapper
    @Inject
    constructor(
        private val objectMapper: ObjectMapper,
    ) {
        fun map(event: StructuredEvent): OrderSearchDocument {
            validateEnvelope(event)
            val payload = parsePayload(event)

            validate(event.aggregateId == payload.orderId) {
                "Event aggregate ID must match the payload order ID"
            }
            validate(payload.status == OrderStatus.READY.name) {
                "OrderReady payload status must be READY"
            }
            validate(event.occurredAt == payload.readyAt) {
                "Event occurrence time must match the payload ready time"
            }

            return mapPayload(payload)
        }

        private fun validateEnvelope(event: StructuredEvent) {
            validate(event.envelopeVersion == SUPPORTED_ENVELOPE_VERSION) {
                "Unsupported event envelope version: ${event.envelopeVersion}"
            }
            validate(event.eventType == SUPPORTED_EVENT_TYPE) {
                "Unsupported event type: ${event.eventType}"
            }
            validate(event.eventVersion == SUPPORTED_EVENT_VERSION) {
                "Unsupported OrderReady event version: ${event.eventVersion}"
            }
            validate(event.aggregateType == SUPPORTED_AGGREGATE_TYPE) {
                "Unsupported aggregate type: ${event.aggregateType}"
            }
            validate(event.payload.isObject) {
                "OrderReady payload must be a JSON object"
            }
        }

        private fun parsePayload(event: StructuredEvent): OrderReadyV2Payload =
            try {
                objectMapper.treeToValue(event.payload, OrderReadyV2Payload::class.java)
            } catch (exception: JsonProcessingException) {
                throw InvalidOrderReadyEventException("OrderReady payload is invalid", exception)
            }

        private fun mapPayload(payload: OrderReadyV2Payload): OrderSearchDocument =
            try {
                OrderSearchDocument(
                    orderId = payload.orderId,
                    aggregateVersion = payload.aggregateVersion,
                    sourceSystem = SourceSystem.from(payload.sourceSystem),
                    externalOrderId = payload.externalOrderId,
                    status = OrderStatus.valueOf(payload.status),
                    currency = Currency.from(payload.currency),
                    totalAmount = payload.totalAmount,
                    receivedAt = payload.receivedAt,
                    readyAt = payload.readyAt,
                    items =
                        payload.items.map { item ->
                            OrderSearchItem(
                                sku = item.sku,
                                description = item.description,
                                quantity = item.quantity,
                                unitPrice = item.unitPrice,
                                lineAmount = item.lineAmount,
                                position = item.position,
                            )
                        },
                )
            } catch (exception: IllegalArgumentException) {
                throw InvalidOrderReadyEventException("OrderReady payload violates the search contract", exception)
            }

        private fun validate(
            condition: Boolean,
            message: () -> String,
        ) {
            if (!condition) {
                throw InvalidOrderReadyEventException(message())
            }
        }

        private companion object {
            const val SUPPORTED_ENVELOPE_VERSION = 1
            const val SUPPORTED_EVENT_TYPE = "OrderReady"
            const val SUPPORTED_EVENT_VERSION = 2
            const val SUPPORTED_AGGREGATE_TYPE = "ORDER"
        }
    }
