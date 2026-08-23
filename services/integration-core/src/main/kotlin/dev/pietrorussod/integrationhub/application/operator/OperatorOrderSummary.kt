package dev.pietrorussod.integrationhub.application.operator

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.math.BigDecimal
import java.time.Instant

data class OperatorOrderSummary(
    val id: OrderId,
    val sourceSystem: SourceSystem,
    val externalOrderId: String,
    val status: OrderStatus,
    val currency: Currency,
    val totalAmount: BigDecimal,
    val receivedAt: Instant,
    val lastEventAt: Instant?,
    val processingAttempts: Int,
)
