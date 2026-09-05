package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.PayloadFingerprint
import dev.pietrorussod.integrationhub.domain.order.SourceSystem

interface OrderRepository {
    fun insertIfAbsent(
        event: OrderReceivedEvent,
        payloadFingerprint: PayloadFingerprint,
    ): OrderInsertResult

    fun findBySourceIdentity(
        sourceSystem: SourceSystem,
        externalOrderId: ExternalOrderId,
    ): Order?

    fun findById(orderId: OrderId): Order?

    fun findByIdForSource(
        orderId: OrderId,
        sourceSystem: SourceSystem,
    ): Order?

    fun updateStatus(
        order: Order,
        expectedStatus: OrderStatus,
        expectedAggregateVersion: Long,
    ): Boolean
}
