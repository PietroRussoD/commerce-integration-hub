package dev.pietrorussod.integrationhub.api.operator

import dev.pietrorussod.integrationhub.application.operator.OperatorOrderDetail
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderItem
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderPage
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderSummary
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderTimelineEntry
import dev.pietrorussod.integrationhub.application.operator.OperatorProcessingAttempt
import dev.pietrorussod.integrationhub.application.search.OrderSearchHit
import dev.pietrorussod.integrationhub.application.search.OrderSearchPage
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionStatus

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

fun OrderSearchPage.toResponse(): OperatorOrderSearchResponse =
    OperatorOrderSearchResponse(
        items = items.map { it.toResponse() },
        limit = limit,
        offset = offset,
        total = total,
    )

fun OrderSearchProjectionStatus.toResponse(): OperatorOrderSearchProjectionStatusResponse =
    OperatorOrderSearchProjectionStatusResponse(
        consumerEnabled = consumerEnabled,
        readAlias = readAlias,
        availability = availability.name,
        reconciliationInProgress = reconciliationInProgress,
        lastReconciliationCompletedAt = lastReconciliationCompletedAt,
        lastReconciliationScannedCount = lastReconciliationScannedCount,
        lastReconciliationAppliedCount = lastReconciliationAppliedCount,
        lastReconciliationIgnoredCount = lastReconciliationIgnoredCount,
        reindex =
            OperatorOrderSearchReindexStatusResponse(
                phase = reindex.phase.name,
                sourceIndex = reindex.sourceIndex,
                candidateIndex = reindex.candidateIndex,
                scannedCount = reindex.progress.scannedCount,
                appliedCount = reindex.progress.appliedCount,
                ignoredNonNewerVersionCount = reindex.progress.ignoredNonNewerVersionCount,
            ),
    )

private fun OrderSearchHit.toResponse(): OperatorOrderSearchHitResponse =
    OperatorOrderSearchHitResponse(
        id = orderId,
        aggregateVersion = aggregateVersion,
        sourceSystem = sourceSystem.value,
        externalOrderId = externalOrderId.value,
        status = status.name,
        currency = currency.name,
        totalAmount = totalAmount.toPlainString(),
        receivedAt = receivedAt,
        readyAt = readyAt,
        itemSkus = itemSkus,
        itemDescriptions = itemDescriptions,
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
