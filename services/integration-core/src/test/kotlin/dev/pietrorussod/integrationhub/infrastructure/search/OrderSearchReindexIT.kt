package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchItem
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjection
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexCutoverOutcome
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexRunResult
import dev.pietrorussod.integrationhub.application.search.RunOrderSearchReindexUseCase
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.messaging.OpenSearchProjectionTestResource
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchReindexState.Companion.ORDER_SEARCH_REINDEX_STATE
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.opensearch.client.opensearch.OpenSearchClient
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
@QuarkusTestResource(OpenSearchProjectionTestResource::class, restrictToAnnotatedClass = true)
@QuarkusTestResource(PostgreSqlTestResource::class, restrictToAnnotatedClass = true)
class OrderSearchReindexIT {
    @Inject
    lateinit var reindex: RunOrderSearchReindexUseCase

    @Inject
    lateinit var projection: OrderSearchProjection

    @Inject
    lateinit var dslContext: DSLContext

    @Inject
    lateinit var openSearchClient: OpenSearchClient

    @BeforeEach
    fun resetState() {
        dslContext.deleteFrom(INTEGRATION_EVENTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
        dslContext
            .update(ORDER_SEARCH_REINDEX_STATE)
            .setNull(ORDER_SEARCH_REINDEX_STATE.SOURCE_INDEX)
            .setNull(ORDER_SEARCH_REINDEX_STATE.CANDIDATE_INDEX)
            .set(ORDER_SEARCH_REINDEX_STATE.PHASE, "IDLE")
            .setNull(ORDER_SEARCH_REINDEX_STATE.CURSOR_RECEIVED_AT)
            .setNull(ORDER_SEARCH_REINDEX_STATE.CURSOR_ORDER_ID)
            .set(ORDER_SEARCH_REINDEX_STATE.SCANNED_COUNT, 0L)
            .set(ORDER_SEARCH_REINDEX_STATE.APPLIED_COUNT, 0L)
            .set(ORDER_SEARCH_REINDEX_STATE.IGNORED_COUNT, 0L)
            .set(ORDER_SEARCH_REINDEX_STATE.VERSION, 0L)
            .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_OWNER)
            .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN)
            .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT)
            .execute()
    }

    @Test
    fun `retains a concurrent projection write through the alias cutover`() {
        val first = readyDocument("ORDER-1", Instant.parse("2026-09-08T08:00:00Z"))
        val second = readyDocument("ORDER-2", Instant.parse("2026-09-08T08:01:00Z"))
        insertReadyOrder(first)
        insertReadyOrder(second)

        assertEquals(OrderSearchReindexRunResult.CandidatePrepared, runReindex())
        assertEquals(OrderSearchReindexRunResult.Advanced::class, runReindex()::class)

        val concurrent = readyDocument("ORDER-3", Instant.parse("2026-09-08T07:59:00Z"))
        insertReadyOrder(concurrent)
        assertEquals(OrderSearchProjectionWriteOutcome.APPLIED, projection.upsert(concurrent))

        assertEquals(OrderSearchReindexRunResult.ReadyForCutover, runReindex())
        assertEquals(
            OrderSearchReindexRunResult.Completed(OrderSearchReindexCutoverOutcome.CUT_OVER),
            runReindex(),
        )

        val aliasIndices =
            openSearchClient
                .indices()
                .getAlias { request -> request.name(OpenSearchOrderIndexDefinition.READ_ALIAS) }
                .result()
                .keys
        assertEquals(setOf("orders-v2"), aliasIndices)
        assertEquals(
            3L,
            openSearchClient.count { request -> request.index(OpenSearchOrderIndexDefinition.READ_ALIAS) }.count(),
        )
    }

    private fun runReindex(): OrderSearchReindexRunResult =
        reindex.run(
            owner = "reindex-integration-test",
            leaseDuration = Duration.ofMinutes(1),
            batchSize = 2,
        )

    private fun insertReadyOrder(document: OrderSearchDocument) {
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, document.orderId)
            .set(ORDERS.SOURCE_SYSTEM, document.sourceSystem.value)
            .set(ORDERS.EXTERNAL_ORDER_ID, document.externalOrderId)
            .set(ORDERS.STATUS, document.status.name)
            .set(ORDERS.CURRENCY, document.currency.name)
            .set(ORDERS.TOTAL_AMOUNT, document.totalAmount)
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.AGGREGATE_VERSION, document.aggregateVersion)
            .set(ORDERS.RECEIVED_AT, document.receivedAt.atOffset(ZoneOffset.UTC))
            .execute()
        dslContext
            .insertInto(ORDER_ITEMS)
            .set(ORDER_ITEMS.ID, UUID.randomUUID())
            .set(ORDER_ITEMS.ORDER_ID, document.orderId)
            .set(ORDER_ITEMS.SKU, document.items.single().sku)
            .set(ORDER_ITEMS.DESCRIPTION, document.items.single().description)
            .set(ORDER_ITEMS.QUANTITY, document.items.single().quantity)
            .set(ORDER_ITEMS.UNIT_PRICE, document.items.single().unitPrice)
            .set(ORDER_ITEMS.LINE_AMOUNT, document.items.single().lineAmount)
            .set(ORDER_ITEMS.POSITION, document.items.single().position)
            .execute()
        dslContext
            .insertInto(INTEGRATION_EVENTS)
            .set(INTEGRATION_EVENTS.ID, UUID.randomUUID())
            .set(INTEGRATION_EVENTS.ORDER_ID, document.orderId)
            .set(INTEGRATION_EVENTS.EVENT_TYPE, "PROCESSING_SUCCEEDED")
            .set(INTEGRATION_EVENTS.FROM_STATUS, "PROCESSING")
            .set(INTEGRATION_EVENTS.TO_STATUS, "READY")
            .set(INTEGRATION_EVENTS.CORRELATION_ID, UUID.randomUUID())
            .set(INTEGRATION_EVENTS.OCCURRED_AT, document.readyAt.atOffset(ZoneOffset.UTC))
            .execute()
    }

    private fun readyDocument(
        externalOrderId: String,
        receivedAt: Instant,
    ): OrderSearchDocument =
        OrderSearchDocument(
            orderId = UUID.randomUUID(),
            aggregateVersion = 3,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = externalOrderId,
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("12.50"),
            receivedAt = receivedAt,
            readyAt = receivedAt.plusSeconds(30),
            items =
                listOf(
                    OrderSearchItem(
                        sku = "SKU-$externalOrderId",
                        description = "Item for $externalOrderId",
                        quantity = BigDecimal.ONE,
                        unitPrice = BigDecimal("12.50"),
                        lineAmount = BigDecimal("12.50"),
                        position = 0,
                    ),
                ),
        )
}
