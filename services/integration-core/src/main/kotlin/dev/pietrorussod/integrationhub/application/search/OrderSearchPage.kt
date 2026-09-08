package dev.pietrorussod.integrationhub.application.search

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID

data class OrderSearchPage(
    val items: List<OrderSearchHit>,
    val limit: Int,
    val offset: Int,
    val total: Long,
)

data class OrderSearchHit(
    val orderId: UUID,
    val aggregateVersion: Long,
    val sourceSystem: SourceSystem,
    val externalOrderId: ExternalOrderId,
    val status: OrderStatus,
    val currency: Currency,
    val totalAmount: BigDecimal,
    val receivedAt: Instant,
    val readyAt: Instant,
    val itemSkus: List<String>,
    val itemDescriptions: List<String>,
)
