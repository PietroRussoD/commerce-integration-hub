package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class ReceiveOrderUseCaseTest {
    private val fixedClock = Clock.fixed(Instant.parse("2026-08-01T07:30:00Z"), ZoneOffset.UTC)
    private val fixedOrderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
    private val fixedItemId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53")

    @Test
    fun `creates an order for a new source identity`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fixedClock, { fixedOrderId }) { fixedItemId }

        val result =
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    externalOrderId = "order-1001",
                    currency = "EUR",
                    items = listOf(itemCommand()),
                ),
            )

        assertEquals(ReceiveOrderOutcome.CREATED, result.outcome)
        assertEquals(fixedOrderId, result.order.id.value)
        assertEquals("marketplace-a", result.order.sourceSystem.value)
        assertEquals("order-1001", result.order.externalOrderId.value)
        assertEquals(Currency.EUR, result.order.currency)
        assertEquals(OrderStatus.RECEIVED, result.order.status)
        assertEquals(
            fixedItemId,
            result.order.items
                .single()
                .id,
        )
        assertEquals(BigDecimal("39.98"), result.order.totalAmount.amount)
        assertEquals(fixedClock.instant(), result.order.receivedAt)
        assertEquals(result.order, repository.savedOrders.single())
    }

    @Test
    fun `returns the existing order when the same source identity is received again`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fixedClock, { fixedOrderId }) { fixedItemId }
        val command =
            ReceiveOrderCommand(
                sourceSystem = "marketplace-a",
                externalOrderId = "order-1001",
                currency = "EUR",
                items = listOf(itemCommand()),
            )

        val firstResult = useCase.receive(command)
        val secondResult = useCase.receive(command)

        assertEquals(ReceiveOrderOutcome.CREATED, firstResult.outcome)
        assertEquals(ReceiveOrderOutcome.ALREADY_RECEIVED, secondResult.outcome)
        assertEquals(firstResult.order, secondResult.order)
        assertEquals(1, repository.savedOrders.size)
    }

    @Test
    fun `rejects an unsupported currency before saving the order`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fixedClock, { fixedOrderId }) { fixedItemId }

        assertThrows(IllegalArgumentException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    externalOrderId = "order-1001",
                    currency = "CHF",
                    items = listOf(itemCommand()),
                ),
            )
        }

        assertTrue(repository.savedOrders.isEmpty())
    }

    @Test
    fun `rejects an order without items before saving it`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fixedClock, { fixedOrderId }) { fixedItemId }

        assertThrows(IllegalArgumentException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    externalOrderId = "order-1001",
                    currency = "EUR",
                    items = emptyList(),
                ),
            )
        }

        assertTrue(repository.savedOrders.isEmpty())
    }

    private fun itemCommand() =
        ReceiveOrderItemCommand(
            externalLineId = "line-1",
            sku = "SKU-BOOK-1",
            description = "First item",
            quantity = BigDecimal("2"),
            unitPrice = BigDecimal("19.99"),
        )

    private class InMemoryOrderRepository : OrderRepository {
        val savedOrders = mutableListOf<Order>()

        override fun insertIfAbsent(order: Order): OrderInsertResult {
            val existingOrder =
                findBySourceIdentity(
                    order.sourceSystem,
                    order.externalOrderId,
                )
            if (existingOrder != null) {
                return OrderInsertResult(existingOrder, inserted = false)
            }

            savedOrders.add(order)
            return OrderInsertResult(order, inserted = true)
        }

        override fun findBySourceIdentity(
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
        ): Order? =
            savedOrders.firstOrNull {
                it.sourceSystem == sourceSystem && it.externalOrderId == externalOrderId
            }
    }
}
