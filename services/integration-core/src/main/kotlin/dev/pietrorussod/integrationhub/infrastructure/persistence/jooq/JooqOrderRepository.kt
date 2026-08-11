package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.order.OrderInsertResult
import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import jakarta.transaction.Transactional
import org.jooq.DSLContext
import java.time.ZoneOffset

@ApplicationScoped
class JooqOrderRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : OrderRepository {
        @Transactional
        override fun insertIfAbsent(order: Order): OrderInsertResult {
            val insertedRows =
                dslContext
                    .insertInto(ORDERS)
                    .set(ORDERS.ID, order.id.value)
                    .set(ORDERS.SOURCE_SYSTEM, order.sourceSystem.value)
                    .set(ORDERS.EXTERNAL_ORDER_ID, order.externalOrderId.value)
                    .set(ORDERS.CURRENCY, order.currency.name)
                    .set(ORDERS.TOTAL_AMOUNT, order.totalAmount.amount)
                    .set(ORDERS.STATUS, order.status.name)
                    .set(ORDERS.RECEIVED_AT, order.receivedAt.atOffset(ZoneOffset.UTC))
                    .onConflict(ORDERS.SOURCE_SYSTEM, ORDERS.EXTERNAL_ORDER_ID)
                    .doNothing()
                    .execute()

            if (insertedRows == 1) {
                insertItems(order)
                return OrderInsertResult(order, inserted = true)
            }

            val existingOrder =
                requireNotNull(
                    findBySourceIdentity(order.sourceSystem, order.externalOrderId),
                ) {
                    "Order must exist after a source identity conflict"
                }

            return OrderInsertResult(existingOrder, inserted = false)
        }

        override fun findBySourceIdentity(
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
        ): Order? {
            val orderRecord =
                dslContext
                    .selectFrom(ORDERS)
                    .where(ORDERS.SOURCE_SYSTEM.eq(sourceSystem.value))
                    .and(ORDERS.EXTERNAL_ORDER_ID.eq(externalOrderId.value))
                    .fetchOne()

            if (orderRecord == null) {
                return null
            }

            val currency =
                Currency.from(
                    requireNotNull(orderRecord.currency) { "Persisted currency must not be null" },
                )
            val items =
                dslContext
                    .selectFrom(ORDER_ITEMS)
                    .where(ORDER_ITEMS.ORDER_ID.eq(orderRecord.id))
                    .orderBy(ORDER_ITEMS.POSITION)
                    .fetch()
                    .map { it.toDomain(currency) }

            return orderRecord.toDomain(currency, items)
        }

        private fun insertItems(order: Order) {
            val statements =
                order.items.map { item ->
                    dslContext
                        .insertInto(ORDER_ITEMS)
                        .set(ORDER_ITEMS.ID, item.id)
                        .set(ORDER_ITEMS.ORDER_ID, order.id.value)
                        .set(ORDER_ITEMS.EXTERNAL_LINE_ID, item.externalLineId)
                        .set(ORDER_ITEMS.SKU, item.sku)
                        .set(ORDER_ITEMS.DESCRIPTION, item.description)
                        .set(ORDER_ITEMS.QUANTITY, item.quantity)
                        .set(ORDER_ITEMS.UNIT_PRICE, item.unitPrice.amount)
                        .set(ORDER_ITEMS.LINE_AMOUNT, item.lineAmount.amount)
                        .set(ORDER_ITEMS.POSITION, item.position)
                }

            dslContext.batch(statements).execute()
        }
    }
