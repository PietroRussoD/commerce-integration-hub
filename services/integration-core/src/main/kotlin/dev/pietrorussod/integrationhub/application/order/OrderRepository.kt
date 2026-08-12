package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.PayloadFingerprint
import dev.pietrorussod.integrationhub.domain.order.SourceSystem

interface OrderRepository {
    fun insertIfAbsent(
        order: Order,
        payloadFingerprint: PayloadFingerprint,
    ): OrderInsertResult

    fun findBySourceIdentity(
        sourceSystem: SourceSystem,
        externalOrderId: ExternalOrderId,
    ): Order?
}
