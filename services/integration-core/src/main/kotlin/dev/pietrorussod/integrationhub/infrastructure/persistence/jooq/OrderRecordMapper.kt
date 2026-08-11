package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.records.OrderItemsRecord
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.records.OrdersRecord

internal fun OrdersRecord.toDomain(
    currency: Currency,
    items: List<OrderItem>,
): Order =
    Order.restore(
        id = OrderId(requireNotNull(id) { "Persisted order id must not be null" }),
        sourceSystem =
            SourceSystem.from(
                requireNotNull(sourceSystem) { "Persisted source system must not be null" },
            ),
        externalOrderId =
            ExternalOrderId.from(
                requireNotNull(externalOrderId) { "Persisted external order id must not be null" },
            ),
        currency = currency,
        items = items,
        totalAmount =
            Money.of(
                requireNotNull(totalAmount) { "Persisted total amount must not be null" },
                currency,
            ),
        status =
            OrderStatus.valueOf(
                requireNotNull(status) { "Persisted order status must not be null" },
            ),
        receivedAt = requireNotNull(receivedAt) { "Persisted received timestamp must not be null" }.toInstant(),
    )

internal fun OrderItemsRecord.toDomain(currency: Currency): OrderItem {
    val item =
        OrderItem.create(
            id = requireNotNull(id) { "Persisted order item id must not be null" },
            externalLineId = externalLineId,
            sku = requireNotNull(sku) { "Persisted SKU must not be null" },
            description = description,
            quantity = requireNotNull(quantity) { "Persisted quantity must not be null" },
            unitPrice =
                Money.of(
                    requireNotNull(unitPrice) { "Persisted unit price must not be null" },
                    currency,
                ),
            position = requireNotNull(position) { "Persisted position must not be null" },
        )
    val persistedLineAmount =
        Money.of(
            requireNotNull(lineAmount) { "Persisted line amount must not be null" },
            currency,
        )
    require(item.lineAmount == persistedLineAmount) {
        "Persisted line amount must match quantity and unit price"
    }
    return item
}
