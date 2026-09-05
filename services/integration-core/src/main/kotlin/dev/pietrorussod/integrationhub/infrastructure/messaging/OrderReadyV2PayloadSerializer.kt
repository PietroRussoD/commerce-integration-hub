package dev.pietrorussod.integrationhub.infrastructure.messaging

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.processing.OrderReadyEvent
import dev.pietrorussod.integrationhub.application.processing.OrderReadyPayloadSerializer
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

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

        private data class OrderReadyV2Payload(
            val orderId: UUID,
            val aggregateVersion: Long,
            val sourceSystem: String,
            val externalOrderId: String,
            val currency: String,
            val totalAmount: BigDecimal,
            val status: String,
            val receivedAt: Instant,
            val readyAt: Instant,
            val items: List<OrderReadyV2ItemPayload>,
        )

        private data class OrderReadyV2ItemPayload(
            val externalLineId: String?,
            val sku: String,
            val description: String?,
            val quantity: BigDecimal,
            val unitPrice: BigDecimal,
            val lineAmount: BigDecimal,
            val position: Int,
        )
    }
