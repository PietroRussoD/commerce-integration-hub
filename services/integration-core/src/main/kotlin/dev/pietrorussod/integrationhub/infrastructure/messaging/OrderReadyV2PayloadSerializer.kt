package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.processing.OrderReadyEvent
import dev.pietrorussod.integrationhub.application.processing.OrderReadyPayloadSerializer
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject

@ApplicationScoped
class OrderReadyV2PayloadSerializer
    @Inject
    constructor(
        private val objectMapper: ObjectMapper,
    ) : OrderReadyPayloadSerializer {
        override fun serialize(event: OrderReadyEvent): String =
            objectMapper.writeValueAsString(
                OrderReadyV2Payload(
                    orderId = event.order.id.value,
                    aggregateVersion = event.order.aggregateVersion,
                    sourceSystem = event.order.sourceSystem.value,
                    externalOrderId = event.order.externalOrderId.value,
                    currency = event.order.currency.name,
                    totalAmount = event.order.totalAmount.amount,
                    status = event.order.status.name,
                    receivedAt = event.order.receivedAt,
                    readyAt = event.occurredAt,
                    items =
                        event.order.items.map { item ->
                            OrderReadyV2ItemPayload(
                                externalLineId = item.externalLineId,
                                sku = item.sku,
                                description = item.description,
                                quantity = item.quantity,
                                unitPrice = item.unitPrice.amount,
                                lineAmount = item.lineAmount.amount,
                                position = item.position,
                            )
                        },
                ),
            )
    }
