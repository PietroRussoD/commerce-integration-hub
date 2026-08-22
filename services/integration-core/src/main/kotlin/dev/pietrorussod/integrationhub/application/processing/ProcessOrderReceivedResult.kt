package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.Order

sealed interface ProcessOrderReceivedResult {
    data class Processed(
        val order: Order,
    ) : ProcessOrderReceivedResult

    data object Duplicate : ProcessOrderReceivedResult
}
