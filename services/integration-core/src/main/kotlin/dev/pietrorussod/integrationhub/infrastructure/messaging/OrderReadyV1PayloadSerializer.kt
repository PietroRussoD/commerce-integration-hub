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
class OrderReadyV1PayloadSerializer
    @Inject
    constructor(
        private val objectMapper: ObjectMapper,
    ) : OrderReadyPayloadSerializer {
        override fun serialize(event: OrderReadyEvent): String =
            objectMapper.writeValueAsString(
                OrderReadyV1Payload(
                    orderId = event.order.id.value,
                    sourceSystem = event.order.sourceSystem.value,
                    externalOrderId = event.order.externalOrderId.value,
                    currency = event.order.currency.name,
                    totalAmount = event.order.totalAmount.amount,
                    status = event.order.status.name,
                    receivedAt = event.order.receivedAt,
                    readyAt = event.occurredAt,
                    items =
                        event.order.items.map { item ->
                            OrderReadyV1ItemPayload(
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

        private data class OrderReadyV1Payload(
            val orderId: UUID,
            val sourceSystem: String,
            val externalOrderId: String,
            val currency: String,
            val totalAmount: BigDecimal,
            val status: String,
            val receivedAt: Instant,
            val readyAt: Instant,
            val items: List<OrderReadyV1ItemPayload>,
        )

        private data class OrderReadyV1ItemPayload(
            val externalLineId: String?,
            val sku: String,
            val description: String?,
            val quantity: BigDecimal,
            val unitPrice: BigDecimal,
            val lineAmount: BigDecimal,
            val position: Int,
        )
    }
