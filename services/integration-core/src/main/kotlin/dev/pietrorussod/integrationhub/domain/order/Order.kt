package dev.pietrorussod.integrationhub.domain.order

import java.time.Instant

data class Order(
    val id: OrderId,
    val sourceSystem: SourceSystem,
    val externalOrderId: ExternalOrderId,
    val status: OrderStatus,
    val receivedAt: Instant,
) {
    companion object {
        fun receive(
            id: OrderId,
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
            receivedAt: Instant,
        ): Order =
            Order(
                id = id,
                sourceSystem = sourceSystem,
                externalOrderId = externalOrderId,
                status = OrderStatus.RECEIVED,
                receivedAt = receivedAt,
            )
    }
}
