package dev.pietrorussod.integrationhub.api.order

import java.time.Instant
import java.util.UUID

data class OrderResponse(
    val id: UUID,
    val sourceSystem: String,
    val externalId: String,
    val currency: String,
    val totalAmount: String,
    val status: String,
    val receivedAt: Instant,
    val items: List<OrderItemResponse>,
)

data class OrderItemResponse(
    val externalLineId: String?,
    val sku: String,
    val description: String?,
    val quantity: String,
    val unitPrice: String,
    val lineAmount: String,
)
