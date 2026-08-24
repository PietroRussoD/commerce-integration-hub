package dev.pietrorussod.integrationhub.api.operator

import dev.pietrorussod.integrationhub.application.operator.OperatorOrderDetail
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderItem
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderPage
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderSummary
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderTimelineEntry
import dev.pietrorussod.integrationhub.application.operator.OperatorProcessingAttempt

fun OperatorOrderPage.toResponse(): OperatorOrderListResponse =
    OperatorOrderListResponse(
        items = items.map { it.toResponse() },
        limit = limit,
        offset = offset,
        total = total,
    )

private fun OperatorOrderSummary.toResponse(): OperatorOrderSummaryResponse =
    OperatorOrderSummaryResponse(
        id = id.value,
        sourceSystem = sourceSystem.value,
        externalOrderId = externalOrderId,
        status = status.name,
        currency = currency.name,
        totalAmount = totalAmount.toPlainString(),
        receivedAt = receivedAt,
        lastEventAt = lastEventAt,
        processingAttempts = processingAttempts,
    )

fun OperatorOrderDetail.toResponse(): OperatorOrderDetailResponse =
    OperatorOrderDetailResponse(
        id = id.value,
        sourceSystem = sourceSystem.value,
        externalOrderId = externalOrderId,
        status = status.name,
        currency = currency.name,
        totalAmount = totalAmount.toPlainString(),
        receivedAt = receivedAt,
        items = items.map { it.toResponse() },
        timeline = timeline.map { it.toResponse() },
        processingAttempts = processingAttempts.map { it.toResponse() },
    )

private fun OperatorOrderItem.toResponse(): OperatorOrderItemResponse =
    OperatorOrderItemResponse(
        externalLineId = externalLineId,
        sku = sku,
        description = description,
        quantity = quantity.toPlainString(),
        unitPrice = unitPrice.toPlainString(),
        lineAmount = lineAmount.toPlainString(),
        position = position,
    )

private fun OperatorOrderTimelineEntry.toResponse(): OperatorOrderTimelineEntryResponse =
    OperatorOrderTimelineEntryResponse(
        id = id,
        eventType = eventType,
        fromStatus = fromStatus?.name,
        toStatus = toStatus?.name,
        message = message,
        correlationId = correlationId,
        occurredAt = occurredAt,
    )

private fun OperatorProcessingAttempt.toResponse(): OperatorProcessingAttemptResponse =
    OperatorProcessingAttemptResponse(
        id = id,
        attemptNumber = attemptNumber,
        status = status.name,
        trigger = trigger.name,
        errorCode = errorCode,
        errorMessage = errorMessage,
        startedAt = startedAt,
        completedAt = completedAt,
    )
