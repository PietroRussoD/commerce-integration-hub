package dev.pietrorussod.integrationhub.application.order

import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
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
    private val fixedEventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f54")
    private val fixedCorrelationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55")
    private val fingerprinter = CanonicalOrderPayloadFingerprinter()

    @Test
    fun `creates an order for a new source identity`() {
        val repository = InMemoryOrderRepository()
        val useCase = useCase(repository)

        val result =
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    correlationId = fixedCorrelationId,
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
        assertEquals(
            OrderReceivedEvent(
                id = fixedEventId,
                correlationId = fixedCorrelationId,
                order = result.order,
                occurredAt = fixedClock.instant(),
            ),
            repository.savedEvents.single(),
        )
    }

    @Test
    fun `returns the existing order when the same source identity is received again`() {
        val repository = InMemoryOrderRepository()
        val useCase = useCase(repository)
        val command =
            ReceiveOrderCommand(
                sourceSystem = "marketplace-a",
                correlationId = fixedCorrelationId,
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
        assertEquals(1, repository.savedEvents.size)
    }

    @Test
    fun `reports a conflict when the same source identity has different content`() {
        val repository = InMemoryOrderRepository()
        val useCase = useCase(repository)
        val original =
            ReceiveOrderCommand(
                sourceSystem = "marketplace-a",
                correlationId = fixedCorrelationId,
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
        assertEquals(1, repository.savedEvents.size)
    }

    @Test
    fun `rejects an unsupported currency before saving the order`() {
        val repository = InMemoryOrderRepository()
        val useCase = useCase(repository)

        assertThrows(InvalidReceiveOrderCommandException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    correlationId = fixedCorrelationId,
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
        val useCase = useCase(repository)

        assertThrows(InvalidReceiveOrderCommandException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    correlationId = fixedCorrelationId,
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
        val useCase = useCase(repository)

        assertThrows(InvalidReceiveOrderCommandException::class.java) {
            useCase.receive(
                ReceiveOrderCommand(
                    sourceSystem = "marketplace-a",
                    correlationId = fixedCorrelationId,
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

    private fun useCase(repository: OrderRepository): ReceiveOrderUseCase =
        ReceiveOrderUseCase(
            orderRepository = repository,
            payloadFingerprinter = fingerprinter,
            clock = fixedClock,
            generateOrderId = { fixedOrderId },
            generateOrderItemId = { fixedItemId },
            generateEventId = { fixedEventId },
        )

    private class InMemoryOrderRepository : OrderRepository {
        val savedOrders = mutableListOf<Order>()
        val savedEvents = mutableListOf<OrderReceivedEvent>()
        private val savedFingerprints = mutableMapOf<UUID, PayloadFingerprint>()

        override fun insertIfAbsent(
            event: OrderReceivedEvent,
            payloadFingerprint: PayloadFingerprint,
        ): OrderInsertResult {
            val order = event.order
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
            savedEvents.add(event)
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

        override fun findById(orderId: OrderId): Order? = savedOrders.firstOrNull { it.id == orderId }

        override fun findByIdForSource(
            orderId: OrderId,
            sourceSystem: SourceSystem,
        ): Order? = savedOrders.firstOrNull { it.id == orderId && it.sourceSystem == sourceSystem }

        override fun updateStatus(
            order: Order,
            expectedStatus: OrderStatus,
            expectedAggregateVersion: Long,
        ): Boolean {
            require(order.status != expectedStatus) {
                "New order status must differ from the expected status"
            }
            val index = savedOrders.indexOfFirst { it.id == order.id && it.status == expectedStatus }
            if (index < 0) {
                return false
            }

            savedOrders[index] = order
            return true
        }
    }
}
