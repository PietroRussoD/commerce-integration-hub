package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.operator.ListOperatorOrdersQuery
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderPage
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderReadRepository
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderSummary
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import jakarta.enterprise.context.ApplicationScoped
import org.jooq.Condition
import org.jooq.DSLContext
import org.jooq.impl.DSL.countDistinct
import org.jooq.impl.DSL.max
import org.jooq.impl.DSL.noCondition

@ApplicationScoped
class JooqOperatorOrderReadRepository(
    private val dslContext: DSLContext,
) : OperatorOrderReadRepository {
    override fun list(query: ListOperatorOrdersQuery): OperatorOrderPage {
        val condition = query.toCondition()
        val lastEventAt = max(INTEGRATION_EVENTS.OCCURRED_AT).`as`("last_event_at")
        val processingAttemptCount = countDistinct(PROCESSING_ATTEMPTS.ID).`as`("processing_attempts")
        val total =
            dslContext
                .selectCount()
                .from(ORDERS)
                .where(condition)
                .fetchSingle(0, Long::class.java)
                .let(::requireNotNull)

        val items =
            dslContext
                .select(
                    ORDERS.ID,
                    ORDERS.SOURCE_SYSTEM,
                    ORDERS.EXTERNAL_ORDER_ID,
                    ORDERS.STATUS,
                    ORDERS.CURRENCY,
                    ORDERS.TOTAL_AMOUNT,
                    ORDERS.RECEIVED_AT,
                    lastEventAt,
                    processingAttemptCount,
                ).from(ORDERS)
                .leftJoin(INTEGRATION_EVENTS)
                .on(INTEGRATION_EVENTS.ORDER_ID.eq(ORDERS.ID))
                .leftJoin(PROCESSING_ATTEMPTS)
                .on(PROCESSING_ATTEMPTS.ORDER_ID.eq(ORDERS.ID))
                .where(condition)
                .groupBy(
                    ORDERS.ID,
                    ORDERS.SOURCE_SYSTEM,
                    ORDERS.EXTERNAL_ORDER_ID,
                    ORDERS.STATUS,
                    ORDERS.CURRENCY,
                    ORDERS.TOTAL_AMOUNT,
                    ORDERS.RECEIVED_AT,
                ).orderBy(ORDERS.RECEIVED_AT.desc(), ORDERS.ID.desc())
                .limit(query.limit)
                .offset(query.offset)
                .fetch { record ->
                    OperatorOrderSummary(
                        id = OrderId(requireNotNull(record[ORDERS.ID])),
                        sourceSystem = SourceSystem.from(requireNotNull(record[ORDERS.SOURCE_SYSTEM])),
                        externalOrderId = requireNotNull(record[ORDERS.EXTERNAL_ORDER_ID]),
                        status = OrderStatus.valueOf(requireNotNull(record[ORDERS.STATUS])),
                        currency = Currency.from(requireNotNull(record[ORDERS.CURRENCY])),
                        totalAmount = requireNotNull(record[ORDERS.TOTAL_AMOUNT]),
                        receivedAt = requireNotNull(record[ORDERS.RECEIVED_AT]).toInstant(),
                        lastEventAt = record[lastEventAt]?.toInstant(),
                        processingAttempts = requireNotNull(record[processingAttemptCount]),
                    )
                }

        return OperatorOrderPage(
            items = items,
            limit = query.limit,
            offset = query.offset,
            total = total,
        )
    }

    private fun ListOperatorOrdersQuery.toCondition(): Condition = status?.let { ORDERS.STATUS.eq(it.name) } ?: noCondition()
}
