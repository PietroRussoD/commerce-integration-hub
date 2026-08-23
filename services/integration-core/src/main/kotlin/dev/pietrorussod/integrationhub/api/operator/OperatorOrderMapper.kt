package dev.pietrorussod.integrationhub.api.operator

import dev.pietrorussod.integrationhub.application.operator.OperatorOrderPage
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderSummary

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
