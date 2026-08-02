package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.records.OrdersRecord

internal fun OrdersRecord.toDomain(): Order =
    Order(
        id = OrderId(requireNotNull(id) { "Persisted order id must not be null" }),
        sourceSystem =
            SourceSystem.from(
                requireNotNull(sourceSystem) { "Persisted source system must not be null" },
            ),
        externalOrderId =
            ExternalOrderId.from(
                requireNotNull(externalOrderId) { "Persisted external order id must not be null" },
            ),
        status =
            OrderStatus.valueOf(
                requireNotNull(status) { "Persisted order status must not be null" },
            ),
        receivedAt = requireNotNull(receivedAt) { "Persisted received timestamp must not be null" }.toInstant(),
    )
