package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchItem
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCounter
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentReader
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.Condition
import org.jooq.DSLContext
import org.jooq.impl.DSL.noCondition
import java.time.ZoneOffset
import java.util.UUID

@ApplicationScoped
class JooqReadyOrderSearchDocumentReader
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : ReadyOrderSearchDocumentReader,
        ReadyOrderSearchDocumentCounter {
        override fun countReadyDocuments(): Long =
            dslContext
                .selectCount()
                .from(ORDERS)
                .where(ORDERS.STATUS.eq(OrderStatus.READY.name))
                .fetchOne(0, Long::class.java)
                ?: 0L

        override fun readPage(
            after: ReadyOrderSearchDocumentCursor?,
            limit: Int,
        ): List<OrderSearchDocument> {
            require(limit in 1..MAX_PAGE_SIZE) { "Ready order search document page size must be between 1 and $MAX_PAGE_SIZE" }

            val readyEvents = INTEGRATION_EVENTS.`as`("ready_events")
            val records =
                dslContext
                    .select(
                        ORDERS.ID,
                        ORDERS.AGGREGATE_VERSION,
                        ORDERS.SOURCE_SYSTEM,
                        ORDERS.EXTERNAL_ORDER_ID,
                        ORDERS.STATUS,
                        ORDERS.CURRENCY,
                        ORDERS.TOTAL_AMOUNT,
                        ORDERS.RECEIVED_AT,
                        readyEvents.OCCURRED_AT,
                    ).from(ORDERS)
                    .join(readyEvents)
                    .on(
                        readyEvents.ORDER_ID
                            .eq(ORDERS.ID)
                            .and(readyEvents.EVENT_TYPE.eq(READY_EVENT_TYPE)),
                    ).where(ORDERS.STATUS.eq(OrderStatus.READY.name))
                    .and(after.toKeysetCondition())
                    .orderBy(ORDERS.RECEIVED_AT.asc(), ORDERS.ID.asc())
                    .limit(limit)
                    .fetch()

            if (records.isEmpty()) {
                return emptyList()
            }

            val itemsByOrderId =
                dslContext
                    .select(
                        ORDER_ITEMS.ORDER_ID,
                        ORDER_ITEMS.SKU,
                        ORDER_ITEMS.DESCRIPTION,
                        ORDER_ITEMS.QUANTITY,
                        ORDER_ITEMS.UNIT_PRICE,
                        ORDER_ITEMS.LINE_AMOUNT,
                        ORDER_ITEMS.POSITION,
                    ).from(ORDER_ITEMS)
                    .where(ORDER_ITEMS.ORDER_ID.`in`(records.map { requireNotNull(it[ORDERS.ID]) }))
                    .orderBy(ORDER_ITEMS.ORDER_ID.asc(), ORDER_ITEMS.POSITION.asc())
                    .fetchGroups(ORDER_ITEMS.ORDER_ID) { record ->
                        OrderSearchItem(
                            sku = requireNotNull(record[ORDER_ITEMS.SKU]),
                            description = record[ORDER_ITEMS.DESCRIPTION],
                            quantity = requireNotNull(record[ORDER_ITEMS.QUANTITY]),
                            unitPrice = requireNotNull(record[ORDER_ITEMS.UNIT_PRICE]),
                            lineAmount = requireNotNull(record[ORDER_ITEMS.LINE_AMOUNT]),
                            position = requireNotNull(record[ORDER_ITEMS.POSITION]),
                        )
                    }

            return records.map { record ->
                val orderId = requireNotNull(record[ORDERS.ID])
                OrderSearchDocument(
                    orderId = orderId,
                    aggregateVersion = requireNotNull(record[ORDERS.AGGREGATE_VERSION]),
                    sourceSystem = SourceSystem.from(requireNotNull(record[ORDERS.SOURCE_SYSTEM])),
                    externalOrderId = requireNotNull(record[ORDERS.EXTERNAL_ORDER_ID]),
                    status = OrderStatus.valueOf(requireNotNull(record[ORDERS.STATUS])),
                    currency = Currency.from(requireNotNull(record[ORDERS.CURRENCY])),
                    totalAmount = requireNotNull(record[ORDERS.TOTAL_AMOUNT]),
                    receivedAt = requireNotNull(record[ORDERS.RECEIVED_AT]).toInstant(),
                    readyAt = requireNotNull(record[readyEvents.OCCURRED_AT]).toInstant(),
                    items = requireNotNull(itemsByOrderId[orderId]) { "Ready order must contain items" },
                )
            }
        }

        private fun ReadyOrderSearchDocumentCursor?.toKeysetCondition(): Condition =
            this?.let { cursor ->
                ORDERS.RECEIVED_AT
                    .gt(cursor.receivedAt.atOffset(ZoneOffset.UTC))
                    .or(
                        ORDERS.RECEIVED_AT
                            .eq(cursor.receivedAt.atOffset(ZoneOffset.UTC))
                            .and(ORDERS.ID.gt(cursor.orderId)),
                    )
            } ?: noCondition()

        private companion object {
            const val MAX_PAGE_SIZE = 500
            const val READY_EVENT_TYPE = "PROCESSING_SUCCEEDED"
        }
    }
