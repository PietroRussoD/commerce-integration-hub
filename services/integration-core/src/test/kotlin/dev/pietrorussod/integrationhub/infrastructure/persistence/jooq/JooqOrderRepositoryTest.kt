package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.order.CanonicalOrderPayloadFingerprinter
import dev.pietrorussod.integrationhub.application.order.OrderInsertOutcome
import dev.pietrorussod.integrationhub.application.order.OrderInsertResult
import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.exception.DataAccessException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@QuarkusTest
class JooqOrderRepositoryTest {
    private val fingerprinter = CanonicalOrderPayloadFingerprinter()

    @Inject
    lateinit var repository: OrderRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteOrders() {
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `inserts and finds an order`() {
        val order = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
        val payloadFingerprint = fingerprinter.fingerprint(order)

        val insertResult = repository.insertIfAbsent(order, payloadFingerprint)
        val persistedOrder =
            repository.findBySourceIdentity(
                order.sourceSystem,
                order.externalOrderId,
            )
        val orderRecord = dslContext.selectFrom(ORDERS).fetchSingle()

        assertEquals(OrderInsertOutcome.INSERTED, insertResult.outcome)
        assertEquals(order, insertResult.order)
        assertEquals(order, persistedOrder)
        assertEquals(payloadFingerprint.value, orderRecord.payloadFingerprint)
        assertEquals(payloadFingerprint.canonicalizationVersion, orderRecord.payloadFingerprintVersion)
    }

    @Test
    fun `returns the existing order for a duplicate source identity`() {
        val firstOrder = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
        val duplicateOrder = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f53")

        insert(firstOrder)
        val duplicateResult = insert(duplicateOrder)

        assertEquals(OrderInsertOutcome.EQUIVALENT_REPLAY, duplicateResult.outcome)
        assertEquals(firstOrder, duplicateResult.order)
        assertEquals(1, dslContext.fetchCount(ORDERS))
        assertEquals(1, dslContext.fetchCount(ORDER_ITEMS))
    }

    @Test
    fun `reports a payload conflict for a duplicate source identity with different content`() {
        val firstOrder = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
        val conflictingOrder =
            order(
                id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f53",
                description = "Changed item",
            )

        insert(firstOrder)
        val conflictResult = insert(conflictingOrder)

        assertEquals(OrderInsertOutcome.PAYLOAD_CONFLICT, conflictResult.outcome)
        assertEquals(firstOrder, conflictResult.order)
        assertEquals(1, dslContext.fetchCount(ORDERS))
        assertEquals(1, dslContext.fetchCount(ORDER_ITEMS))
    }

    @Test
    fun `handles concurrent inserts for the same source identity`() {
        val firstOrder = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
        val secondOrder = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f53")
        val executor = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)

        try {
            val futures =
                listOf(firstOrder, secondOrder).map { candidate ->
                    executor.submit(
                        Callable<OrderInsertResult> {
                            start.await()
                            insert(candidate)
                        },
                    )
                }

            start.countDown()
            val results = futures.map { it.get(10, TimeUnit.SECONDS) }

            assertEquals(1, results.count { it.outcome == OrderInsertOutcome.INSERTED })
            assertEquals(1, results.count { it.outcome == OrderInsertOutcome.EQUIVALENT_REPLAY })
            assertEquals(1, results.map { it.order.id }.distinct().size)
            assertEquals(1, dslContext.fetchCount(ORDERS))
            assertEquals(1, dslContext.fetchCount(ORDER_ITEMS))
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `rolls back the order when an item insert fails`() {
        val sharedItemId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f54")
        val firstOrder =
            order(
                id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52",
                itemId = sharedItemId,
            )
        val secondOrder =
            order(
                id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f53",
                externalOrderId = "order-1002",
                itemId = sharedItemId,
            )

        insert(firstOrder)

        assertThrows(DataAccessException::class.java) {
            insert(secondOrder)
        }

        assertEquals(1, dslContext.fetchCount(ORDERS))
        assertEquals(1, dslContext.fetchCount(ORDER_ITEMS))
        assertEquals(
            null,
            repository.findBySourceIdentity(secondOrder.sourceSystem, secondOrder.externalOrderId),
        )
    }

    @Test
    fun `rejects a persisted total that does not match the items`() {
        val order = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
        insert(order)
        dslContext
            .update(ORDERS)
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal("40.00"))
            .where(ORDERS.ID.eq(order.id.value))
            .execute()

        assertThrows(IllegalArgumentException::class.java) {
            repository.findBySourceIdentity(order.sourceSystem, order.externalOrderId)
        }
    }

    @Test
    fun `rejects a persisted line amount that does not match quantity and unit price`() {
        val order = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
        insert(order)
        dslContext
            .update(ORDER_ITEMS)
            .set(ORDER_ITEMS.LINE_AMOUNT, BigDecimal("40.00"))
            .where(ORDER_ITEMS.ORDER_ID.eq(order.id.value))
            .execute()

        assertThrows(IllegalArgumentException::class.java) {
            repository.findBySourceIdentity(order.sourceSystem, order.externalOrderId)
        }
    }

    private fun order(
        id: String,
        externalOrderId: String = "order-1001",
        itemId: UUID = UUID.nameUUIDFromBytes("item-$id".toByteArray()),
        description: String = "First item",
    ): Order =
        Order.receive(
            id = OrderId(UUID.fromString(id)),
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = ExternalOrderId.from(externalOrderId),
            currency = Currency.EUR,
            items =
                listOf(
                    OrderItem.create(
                        id = itemId,
                        externalLineId = "line-1",
                        sku = "SKU-BOOK-1",
                        description = description,
                        quantity = BigDecimal("2"),
                        unitPrice = Money.of(BigDecimal("19.99"), Currency.EUR),
                        position = 0,
                    ),
                ),
            declaredTotalAmount = Money.of(BigDecimal("39.98"), Currency.EUR),
            receivedAt = Instant.parse("2026-08-02T06:30:00Z"),
        )

    private fun insert(order: Order): OrderInsertResult = repository.insertIfAbsent(order, fingerprinter.fingerprint(order))
}
