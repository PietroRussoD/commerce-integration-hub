package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.operator.ListOperatorOrdersQuery
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderDetail
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderItem
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderPage
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderReadRepository
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderSummary
import dev.pietrorussod.integrationhub.application.operator.OperatorOrderTimelineEntry
import dev.pietrorussod.integrationhub.application.operator.OperatorProcessingAttempt
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptStatus
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptTrigger
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
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

    override fun findById(orderId: OrderId): OperatorOrderDetail? {
        val orderRecord =
            dslContext
                .select(
                    ORDERS.ID,
                    ORDERS.SOURCE_SYSTEM,
                    ORDERS.EXTERNAL_ORDER_ID,
                    ORDERS.STATUS,
                    ORDERS.CURRENCY,
                    ORDERS.TOTAL_AMOUNT,
                    ORDERS.RECEIVED_AT,
                ).from(ORDERS)
                .where(ORDERS.ID.eq(orderId.value))
                .fetchOne() ?: return null

        return OperatorOrderDetail(
            id = OrderId(requireNotNull(orderRecord[ORDERS.ID])),
            sourceSystem = SourceSystem.from(requireNotNull(orderRecord[ORDERS.SOURCE_SYSTEM])),
            externalOrderId = requireNotNull(orderRecord[ORDERS.EXTERNAL_ORDER_ID]),
            status = OrderStatus.valueOf(requireNotNull(orderRecord[ORDERS.STATUS])),
            currency = Currency.from(requireNotNull(orderRecord[ORDERS.CURRENCY])),
            totalAmount = requireNotNull(orderRecord[ORDERS.TOTAL_AMOUNT]),
            receivedAt = requireNotNull(orderRecord[ORDERS.RECEIVED_AT]).toInstant(),
            items = findItems(orderId),
            timeline = findTimeline(orderId),
            processingAttempts = findProcessingAttempts(orderId),
        )
    }

    private fun findItems(orderId: OrderId): List<OperatorOrderItem> =
        dslContext
            .select(
                ORDER_ITEMS.EXTERNAL_LINE_ID,
                ORDER_ITEMS.SKU,
                ORDER_ITEMS.DESCRIPTION,
                ORDER_ITEMS.QUANTITY,
                ORDER_ITEMS.UNIT_PRICE,
                ORDER_ITEMS.LINE_AMOUNT,
                ORDER_ITEMS.POSITION,
            ).from(ORDER_ITEMS)
            .where(ORDER_ITEMS.ORDER_ID.eq(orderId.value))
            .orderBy(ORDER_ITEMS.POSITION.asc())
            .fetch { record ->
                OperatorOrderItem(
                    externalLineId = record[ORDER_ITEMS.EXTERNAL_LINE_ID],
                    sku = requireNotNull(record[ORDER_ITEMS.SKU]),
                    description = record[ORDER_ITEMS.DESCRIPTION],
                    quantity = requireNotNull(record[ORDER_ITEMS.QUANTITY]),
                    unitPrice = requireNotNull(record[ORDER_ITEMS.UNIT_PRICE]),
                    lineAmount = requireNotNull(record[ORDER_ITEMS.LINE_AMOUNT]),
                    position = requireNotNull(record[ORDER_ITEMS.POSITION]),
                )
            }

    private fun findTimeline(orderId: OrderId): List<OperatorOrderTimelineEntry> =
        dslContext
            .select(
                INTEGRATION_EVENTS.ID,
                INTEGRATION_EVENTS.EVENT_TYPE,
                INTEGRATION_EVENTS.FROM_STATUS,
                INTEGRATION_EVENTS.TO_STATUS,
                INTEGRATION_EVENTS.MESSAGE,
                INTEGRATION_EVENTS.CORRELATION_ID,
                INTEGRATION_EVENTS.OCCURRED_AT,
            ).from(INTEGRATION_EVENTS)
            .where(INTEGRATION_EVENTS.ORDER_ID.eq(orderId.value))
            .orderBy(INTEGRATION_EVENTS.OCCURRED_AT.asc(), INTEGRATION_EVENTS.ID.asc())
            .fetch { record ->
                OperatorOrderTimelineEntry(
                    id = requireNotNull(record[INTEGRATION_EVENTS.ID]),
                    eventType = requireNotNull(record[INTEGRATION_EVENTS.EVENT_TYPE]),
                    fromStatus = record[INTEGRATION_EVENTS.FROM_STATUS]?.let(OrderStatus::valueOf),
                    toStatus = record[INTEGRATION_EVENTS.TO_STATUS]?.let(OrderStatus::valueOf),
                    message = record[INTEGRATION_EVENTS.MESSAGE],
                    correlationId = requireNotNull(record[INTEGRATION_EVENTS.CORRELATION_ID]),
                    occurredAt = requireNotNull(record[INTEGRATION_EVENTS.OCCURRED_AT]).toInstant(),
                )
            }

    private fun findProcessingAttempts(orderId: OrderId): List<OperatorProcessingAttempt> =
        dslContext
            .select(
                PROCESSING_ATTEMPTS.ID,
                PROCESSING_ATTEMPTS.ATTEMPT_NUMBER,
                PROCESSING_ATTEMPTS.STATUS,
                PROCESSING_ATTEMPTS.TRIGGER_TYPE,
                PROCESSING_ATTEMPTS.ERROR_CODE,
                PROCESSING_ATTEMPTS.ERROR_MESSAGE,
                PROCESSING_ATTEMPTS.STARTED_AT,
                PROCESSING_ATTEMPTS.COMPLETED_AT,
            ).from(PROCESSING_ATTEMPTS)
            .where(PROCESSING_ATTEMPTS.ORDER_ID.eq(orderId.value))
            .orderBy(PROCESSING_ATTEMPTS.ATTEMPT_NUMBER.asc())
            .fetch { record ->
                OperatorProcessingAttempt(
                    id = requireNotNull(record[PROCESSING_ATTEMPTS.ID]),
                    attemptNumber = requireNotNull(record[PROCESSING_ATTEMPTS.ATTEMPT_NUMBER]),
                    status = ProcessingAttemptStatus.valueOf(requireNotNull(record[PROCESSING_ATTEMPTS.STATUS])),
                    trigger = ProcessingAttemptTrigger.valueOf(requireNotNull(record[PROCESSING_ATTEMPTS.TRIGGER_TYPE])),
                    errorCode = record[PROCESSING_ATTEMPTS.ERROR_CODE],
                    errorMessage = record[PROCESSING_ATTEMPTS.ERROR_MESSAGE],
                    startedAt = requireNotNull(record[PROCESSING_ATTEMPTS.STARTED_AT]).toInstant(),
                    completedAt = record[PROCESSING_ATTEMPTS.COMPLETED_AT]?.toInstant(),
                )
            }

    private fun ListOperatorOrdersQuery.toCondition(): Condition = status?.let { ORDERS.STATUS.eq(it.name) } ?: noCondition()
}
