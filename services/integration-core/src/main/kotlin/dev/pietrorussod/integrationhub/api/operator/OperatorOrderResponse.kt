package dev.pietrorussod.integrationhub.api.operator

import java.time.Instant
import java.util.UUID

data class OperatorOrderListResponse(
    val items: List<OperatorOrderSummaryResponse>,
    val limit: Int,
    val offset: Int,
    val total: Long,
)

data class OperatorOrderSummaryResponse(
    val id: UUID,
    val sourceSystem: String,
    val externalOrderId: String,
    val status: String,
    val currency: String,
    val totalAmount: String,
    val receivedAt: Instant,
    val lastEventAt: Instant?,
    val processingAttempts: Int,
)
