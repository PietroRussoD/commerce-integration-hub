package dev.pietrorussod.integrationhub.application.operator

import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptStatus
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptTrigger
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class OperatorOrderDetail(
    val id: OrderId,
    val sourceSystem: SourceSystem,
    val externalOrderId: String,
    val status: OrderStatus,
    val currency: Currency,
    val totalAmount: BigDecimal,
    val receivedAt: Instant,
    val items: List<OperatorOrderItem>,
    val timeline: List<OperatorOrderTimelineEntry>,
    val processingAttempts: List<OperatorProcessingAttempt>,
)

data class OperatorOrderItem(
    val externalLineId: String?,
    val sku: String,
    val description: String?,
    val quantity: BigDecimal,
    val unitPrice: BigDecimal,
    val lineAmount: BigDecimal,
    val position: Int,
)

data class OperatorOrderTimelineEntry(
    val id: UUID,
    val eventType: String,
    val fromStatus: OrderStatus?,
    val toStatus: OrderStatus?,
    val message: String?,
    val correlationId: UUID,
    val occurredAt: Instant,
)

data class OperatorProcessingAttempt(
    val id: UUID,
    val attemptNumber: Int,
    val status: ProcessingAttemptStatus,
    val trigger: ProcessingAttemptTrigger,
    val errorCode: String?,
    val errorMessage: String?,
    val startedAt: Instant,
    val completedAt: Instant?,
)
