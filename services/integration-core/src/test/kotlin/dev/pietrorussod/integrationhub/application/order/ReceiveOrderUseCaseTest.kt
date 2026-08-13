package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.PayloadFingerprint
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
    private val fingerprinter = CanonicalOrderPayloadFingerprinter()

    @Test
    fun `creates an order for a new source identity`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fingerprinter, fixedClock, { fixedOrderId }) { fixedItemId }

        val result =
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    externalOrderId = "order-1001",
                    currency = "EUR",
                    declaredTotalAmount = BigDecimal("39.98"),
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
        val useCase = ReceiveOrderUseCase(repository, fingerprinter, fixedClock, { fixedOrderId }) { fixedItemId }
        val command =
            ReceiveOrderCommand(
                sourceSystem = "marketplace-a",
                externalOrderId = "order-1001",
                currency = "EUR",
                declaredTotalAmount = BigDecimal("39.98"),
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
    fun `reports a conflict when the same source identity has different content`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fingerprinter, fixedClock, { fixedOrderId }) { fixedItemId }
        val original =
            ReceiveOrderCommand(
                sourceSystem = "marketplace-a",
                externalOrderId = "order-1001",
                currency = "EUR",
                declaredTotalAmount = BigDecimal("39.98"),
                items = listOf(itemCommand()),
            )
        val changed = original.copy(items = listOf(itemCommand(description = "Changed item")))

        val firstResult = useCase.receive(original)
        val conflictResult = useCase.receive(changed)

        assertEquals(ReceiveOrderOutcome.CREATED, firstResult.outcome)
        assertEquals(ReceiveOrderOutcome.PAYLOAD_CONFLICT, conflictResult.outcome)
        assertEquals(firstResult.order, conflictResult.order)
        assertEquals(1, repository.savedOrders.size)
    }

    @Test
    fun `rejects an unsupported currency before saving the order`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fingerprinter, fixedClock, { fixedOrderId }) { fixedItemId }

        assertThrows(InvalidReceiveOrderCommandException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    externalOrderId = "order-1001",
                    currency = "CHF",
                    declaredTotalAmount = BigDecimal("39.98"),
                    items = listOf(itemCommand()),
                ),
            )
        }

        assertTrue(repository.savedOrders.isEmpty())
    }

    @Test
    fun `rejects an order without items before saving it`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fingerprinter, fixedClock, { fixedOrderId }) { fixedItemId }

        assertThrows(InvalidReceiveOrderCommandException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    externalOrderId = "order-1001",
                    currency = "EUR",
                    declaredTotalAmount = BigDecimal.ZERO,
                    items = emptyList(),
                ),
            )
        }

        assertTrue(repository.savedOrders.isEmpty())
    }

    @Test
    fun `rejects a declared total that differs from the calculated total before saving`() {
        val repository = InMemoryOrderRepository()
        val useCase = ReceiveOrderUseCase(repository, fingerprinter, fixedClock, { fixedOrderId }) { fixedItemId }

        assertThrows(InvalidReceiveOrderCommandException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    externalOrderId = "order-1001",
                    currency = "EUR",
                    declaredTotalAmount = BigDecimal("39.97"),
                    items = listOf(itemCommand()),
                ),
            )
        }

        assertTrue(repository.savedOrders.isEmpty())
    }

    private fun itemCommand(description: String = "First item") =
        ReceiveOrderItemCommand(
            externalLineId = "line-1",
            sku = "SKU-BOOK-1",
            description = description,
            quantity = BigDecimal("2"),
            unitPrice = BigDecimal("19.99"),
        )

    private class InMemoryOrderRepository : OrderRepository {
        val savedOrders = mutableListOf<Order>()
        private val savedFingerprints = mutableMapOf<UUID, PayloadFingerprint>()

        override fun insertIfAbsent(
            order: Order,
            payloadFingerprint: PayloadFingerprint,
        ): OrderInsertResult {
            val existingOrder =
                findBySourceIdentity(
                    order.sourceSystem,
                    order.externalOrderId,
                )
            if (existingOrder != null) {
                val outcome =
                    if (savedFingerprints.getValue(existingOrder.id.value) == payloadFingerprint) {
                        OrderInsertOutcome.EQUIVALENT_REPLAY
                    } else {
                        OrderInsertOutcome.PAYLOAD_CONFLICT
                    }
                return OrderInsertResult(existingOrder, outcome)
            }

            savedOrders.add(order)
            savedFingerprints[order.id.value] = payloadFingerprint
            return OrderInsertResult(order, OrderInsertOutcome.INSERTED)
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
