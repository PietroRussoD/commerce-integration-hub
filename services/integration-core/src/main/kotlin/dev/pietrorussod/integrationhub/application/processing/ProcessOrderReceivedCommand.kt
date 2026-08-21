package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.OrderId
import java.util.UUID

data class ProcessOrderReceivedCommand(
    val eventId: UUID,
    val orderId: OrderId,
    val correlationId: UUID,
)
