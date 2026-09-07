package dev.pietrorussod.integrationhub.infrastructure.messaging

import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class OrderReadyV2Payload(
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

data class OrderReadyV2ItemPayload(
    val externalLineId: String?,
    val sku: String,
    val description: String?,
    val quantity: BigDecimal,
    val unitPrice: BigDecimal,
    val lineAmount: BigDecimal,
    val position: Int,
)
