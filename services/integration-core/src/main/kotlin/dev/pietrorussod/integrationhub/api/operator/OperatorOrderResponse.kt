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

data class OperatorOrderSearchResponse(
    val items: List<OperatorOrderSearchHitResponse>,
    val limit: Int,
    val offset: Int,
    val total: Long,
)

data class OperatorOrderSearchHitResponse(
    val id: UUID,
    val aggregateVersion: Long,
    val sourceSystem: String,
    val externalOrderId: String,
    val status: String,
    val currency: String,
    val totalAmount: String,
    val receivedAt: Instant,
    val readyAt: Instant,
    val itemSkus: List<String>,
    val itemDescriptions: List<String>,
)

data class OperatorOrderSearchProjectionStatusResponse(
    val consumerEnabled: Boolean,
    val readAlias: String,
    val availability: String,
    val reconciliationInProgress: Boolean,
    val lastReconciliationCompletedAt: Instant?,
    val lastReconciliationScannedCount: Long?,
    val lastReconciliationAppliedCount: Long?,
    val lastReconciliationIgnoredCount: Long?,
)

data class OperatorOrderDetailResponse(
    val id: UUID,
    val sourceSystem: String,
    val externalOrderId: String,
    val status: String,
    val currency: String,
    val totalAmount: String,
    val receivedAt: Instant,
    val items: List<OperatorOrderItemResponse>,
    val timeline: List<OperatorOrderTimelineEntryResponse>,
    val processingAttempts: List<OperatorProcessingAttemptResponse>,
)

data class OperatorOrderItemResponse(
    val externalLineId: String?,
    val sku: String,
    val description: String?,
    val quantity: String,
    val unitPrice: String,
    val lineAmount: String,
    val position: Int,
)

data class OperatorOrderTimelineEntryResponse(
    val id: UUID,
    val eventType: String,
    val fromStatus: String?,
    val toStatus: String?,
    val message: String?,
    val correlationId: UUID,
    val occurredAt: Instant,
)

data class OperatorProcessingAttemptResponse(
    val id: UUID,
    val attemptNumber: Int,
    val status: String,
    val trigger: String,
    val errorCode: String?,
    val errorMessage: String?,
    val startedAt: Instant,
    val completedAt: Instant?,
)
