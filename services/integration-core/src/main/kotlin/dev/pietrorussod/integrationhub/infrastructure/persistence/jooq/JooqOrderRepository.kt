package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import com.fasterxml.jackson.databind.ObjectMapper
import dev.pietrorussod.integrationhub.application.order.OrderInsertOutcome
import dev.pietrorussod.integrationhub.application.order.OrderInsertResult
import dev.pietrorussod.integrationhub.application.order.OrderReceivedEvent
import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.PayloadFingerprint
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.records.OrdersRecord
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import jakarta.transaction.Transactional
import org.jooq.DSLContext
import org.jooq.JSON
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@ApplicationScoped
class JooqOrderRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
        private val objectMapper: ObjectMapper,
    ) : OrderRepository {
        @Transactional
        override fun insertIfAbsent(
            event: OrderReceivedEvent,
            payloadFingerprint: PayloadFingerprint,
        ): OrderInsertResult {
            val order = event.order
            val outboxPayload = serializeOutboxPayload(event)
            val insertedRows =
                dslContext
                    .insertInto(ORDERS)
                    .set(ORDERS.ID, order.id.value)
                    .set(ORDERS.SOURCE_SYSTEM, order.sourceSystem.value)
                    .set(ORDERS.EXTERNAL_ORDER_ID, order.externalOrderId.value)
                    .set(ORDERS.CURRENCY, order.currency.name)
                    .set(ORDERS.TOTAL_AMOUNT, order.totalAmount.amount)
                    .set(ORDERS.PAYLOAD_FINGERPRINT, payloadFingerprint.value)
                    .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, payloadFingerprint.canonicalizationVersion)
                    .set(ORDERS.STATUS, order.status.name)
                    .set(ORDERS.RECEIVED_AT, order.receivedAt.atOffset(ZoneOffset.UTC))
                    .onConflict(ORDERS.SOURCE_SYSTEM, ORDERS.EXTERNAL_ORDER_ID)
                    .doNothing()
                    .execute()

            if (insertedRows == 1) {
                insertItems(order)
                insertIntegrationEvent(event)
                insertOutboxEvent(event, outboxPayload)
                return OrderInsertResult(order, OrderInsertOutcome.INSERTED)
            }

            val existing =
                requireNotNull(
                    findStoredOrderBySourceIdentity(order.sourceSystem, order.externalOrderId),
                ) {
                    "Order must exist after a source identity conflict"
                }

            val outcome =
                if (existing.payloadFingerprint == payloadFingerprint) {
                    OrderInsertOutcome.EQUIVALENT_REPLAY
                } else {
                    OrderInsertOutcome.PAYLOAD_CONFLICT
                }

            return OrderInsertResult(existing.order, outcome)
        }

        override fun findBySourceIdentity(
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
        ): Order? = findStoredOrderBySourceIdentity(sourceSystem, externalOrderId)?.order

        override fun findById(orderId: OrderId): Order? =
            dslContext
                .selectFrom(ORDERS)
                .where(ORDERS.ID.eq(orderId.value))
                .fetchOne()
                ?.toStoredOrder()
                ?.order

        override fun findByIdForSource(
            orderId: OrderId,
            sourceSystem: SourceSystem,
        ): Order? {
            val orderRecord =
                dslContext
                    .selectFrom(ORDERS)
                    .where(ORDERS.ID.eq(orderId.value))
                    .and(ORDERS.SOURCE_SYSTEM.eq(sourceSystem.value))
                    .fetchOne()

            return orderRecord?.toStoredOrder()?.order
        }

        override fun updateStatus(
            order: Order,
            expectedStatus: OrderStatus,
        ): Boolean {
            require(order.status != expectedStatus) {
                "New order status must differ from the expected status"
            }

            return dslContext
                .update(ORDERS)
                .set(ORDERS.STATUS, order.status.name)
                .where(ORDERS.ID.eq(order.id.value))
                .and(ORDERS.STATUS.eq(expectedStatus.name))
                .execute() == 1
        }

        private fun findStoredOrderBySourceIdentity(
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
        ): StoredOrder? {
            val orderRecord =
                dslContext
                    .selectFrom(ORDERS)
                    .where(ORDERS.SOURCE_SYSTEM.eq(sourceSystem.value))
                    .and(ORDERS.EXTERNAL_ORDER_ID.eq(externalOrderId.value))
                    .fetchOne()

            return orderRecord?.toStoredOrder()
        }

        private fun OrdersRecord.toStoredOrder(): StoredOrder {
            val currency =
                Currency.from(
                    requireNotNull(currency) { "Persisted currency must not be null" },
                )
            val items =
                dslContext
                    .selectFrom(ORDER_ITEMS)
                    .where(ORDER_ITEMS.ORDER_ID.eq(id))
                    .orderBy(ORDER_ITEMS.POSITION)
                    .fetch()
                    .map { it.toDomain(currency) }

            return StoredOrder(
                order = toDomain(currency, items),
                payloadFingerprint =
                    PayloadFingerprint(
                        value = requireNotNull(payloadFingerprint),
                        canonicalizationVersion = requireNotNull(payloadFingerprintVersion),
                    ),
            )
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

        private fun insertIntegrationEvent(event: OrderReceivedEvent) {
            dslContext
                .insertInto(INTEGRATION_EVENTS)
                .set(INTEGRATION_EVENTS.ID, event.id)
                .set(INTEGRATION_EVENTS.ORDER_ID, event.order.id.value)
                .set(INTEGRATION_EVENTS.EVENT_TYPE, ORDER_RECEIVED_TIMELINE_EVENT)
                .set(INTEGRATION_EVENTS.TO_STATUS, event.order.status.name)
                .set(INTEGRATION_EVENTS.CORRELATION_ID, event.correlationId)
                .set(INTEGRATION_EVENTS.OCCURRED_AT, event.occurredAt.atOffset(ZoneOffset.UTC))
                .execute()
        }

        private fun insertOutboxEvent(
            event: OrderReceivedEvent,
            payload: JSON,
        ) {
            dslContext
                .insertInto(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.ID, event.id)
                .set(OUTBOX_EVENTS.AGGREGATE_TYPE, ORDER_AGGREGATE_TYPE)
                .set(OUTBOX_EVENTS.AGGREGATE_ID, event.order.id.value)
                .set(OUTBOX_EVENTS.EVENT_TYPE, ORDER_RECEIVED_OUTBOX_EVENT)
                .set(OUTBOX_EVENTS.EVENT_VERSION, ORDER_RECEIVED_EVENT_VERSION)
                .set(OUTBOX_EVENTS.PAYLOAD, payload)
                .set(OUTBOX_EVENTS.CORRELATION_ID, event.correlationId)
                .set(OUTBOX_EVENTS.CREATED_AT, event.occurredAt.atOffset(ZoneOffset.UTC))
                .set(OUTBOX_EVENTS.STATUS, PENDING_OUTBOX_STATUS)
                .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, event.occurredAt.atOffset(ZoneOffset.UTC))
                .execute()
        }

        private fun serializeOutboxPayload(event: OrderReceivedEvent): JSON =
            JSON.valueOf(objectMapper.writeValueAsString(event.toPayload()))

        private fun OrderReceivedEvent.toPayload(): OrderReceivedPayload =
            OrderReceivedPayload(
                orderId = order.id.value,
                sourceSystem = order.sourceSystem.value,
                externalOrderId = order.externalOrderId.value,
                currency = order.currency.name,
                totalAmount = order.totalAmount.amount,
                status = order.status.name,
                receivedAt = order.receivedAt,
                items =
                    order.items.map { item ->
                        OrderReceivedItemPayload(
                            externalLineId = item.externalLineId,
                            sku = item.sku,
                            description = item.description,
                            quantity = item.quantity,
                            unitPrice = item.unitPrice.amount,
                            lineAmount = item.lineAmount.amount,
                            position = item.position,
                        )
                    },
            )

        private data class StoredOrder(
            val order: Order,
            val payloadFingerprint: PayloadFingerprint,
        )

        private data class OrderReceivedPayload(
            val orderId: UUID,
            val sourceSystem: String,
            val externalOrderId: String,
            val currency: String,
            val totalAmount: BigDecimal,
            val status: String,
            val receivedAt: Instant,
            val items: List<OrderReceivedItemPayload>,
        )

        private data class OrderReceivedItemPayload(
            val externalLineId: String?,
            val sku: String,
            val description: String?,
            val quantity: BigDecimal,
            val unitPrice: BigDecimal,
            val lineAmount: BigDecimal,
            val position: Int,
        )

        private companion object {
            const val ORDER_AGGREGATE_TYPE = "ORDER"
            const val ORDER_RECEIVED_TIMELINE_EVENT = "ORDER_RECEIVED"
            const val ORDER_RECEIVED_OUTBOX_EVENT = "OrderReceived"
            const val ORDER_RECEIVED_EVENT_VERSION = 1
            const val PENDING_OUTBOX_STATUS = "PENDING"
        }
    }
