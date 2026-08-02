package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.order.OrderInsertResult
import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
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
                    .set(ORDERS.STATUS, order.status.name)
                    .set(ORDERS.RECEIVED_AT, order.receivedAt.atOffset(ZoneOffset.UTC))
                    .onConflict(ORDERS.SOURCE_SYSTEM, ORDERS.EXTERNAL_ORDER_ID)
                    .doNothing()
                    .execute()

            if (insertedRows == 1) {
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
        ): Order? =
            dslContext
                .selectFrom(ORDERS)
                .where(ORDERS.SOURCE_SYSTEM.eq(sourceSystem.value))
                .and(ORDERS.EXTERNAL_ORDER_ID.eq(externalOrderId.value))
                .fetchOne()
                ?.toDomain()
    }
