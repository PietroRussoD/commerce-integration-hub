package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.order.OrderInsertResult
import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@QuarkusTest
class JooqOrderRepositoryTest {
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

        val insertResult = repository.insertIfAbsent(order)
        val persistedOrder =
            repository.findBySourceIdentity(
                order.sourceSystem,
                order.externalOrderId,
            )

        assertTrue(insertResult.inserted)
        assertEquals(order, insertResult.order)
        assertEquals(order, persistedOrder)
    }

    @Test
    fun `returns the existing order for a duplicate source identity`() {
        val firstOrder = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
        val duplicateOrder = order(id = "018f38c2-1b95-7cc4-bb89-72d26a6f9f53")

        repository.insertIfAbsent(firstOrder)
        val duplicateResult = repository.insertIfAbsent(duplicateOrder)

        assertFalse(duplicateResult.inserted)
        assertEquals(firstOrder, duplicateResult.order)
        assertEquals(1, dslContext.fetchCount(ORDERS))
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
                            repository.insertIfAbsent(candidate)
                        },
                    )
                }

            start.countDown()
            val results = futures.map { it.get(10, TimeUnit.SECONDS) }

            assertEquals(1, results.count { it.inserted })
            assertEquals(1, results.map { it.order.id }.distinct().size)
            assertEquals(1, dslContext.fetchCount(ORDERS))
        } finally {
            executor.shutdownNow()
        }
    }

    private fun order(id: String): Order =
        Order.receive(
            id = OrderId(UUID.fromString(id)),
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = ExternalOrderId.from("order-1001"),
            receivedAt = Instant.parse("2026-08-02T06:30:00Z"),
        )
}
