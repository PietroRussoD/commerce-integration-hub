package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.application.order.OrderInsertResult
import dev.pietrorussod.integrationhub.application.order.OrderReceivedEvent
import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.application.outbox.PendingOutboxEvent
import dev.pietrorussod.integrationhub.application.outbox.PendingOutboxEventRepository
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.ExternalOrderId
import dev.pietrorussod.integrationhub.domain.order.Money
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.domain.order.OrderItem
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.PayloadFingerprint
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class ProcessOrderReceivedUseCaseTest {
    private val processedAt = Instant.parse("2026-08-21T08:00:02Z")
    private val orderId = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"))
    private val correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55")
    private val generatedIds =
        listOf(
            UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
            UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f62"),
            UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f63"),
            UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f64"),
        )

    @Test
    fun `processes a received order and records every successful effect`() {
        val fixture = RecordingCollaborators(receivedOrder())
        val ids = generatedIds.iterator()
        val useCase =
            ProcessOrderReceivedUseCase(
                processedMessageRepository = fixture,
                orderRepository = fixture,
                processingAttemptRepository = fixture,
                orderTimelineRepository = fixture,
                orderReadyPayloadSerializer = fixture,
                pendingOutboxEventRepository = fixture,
                clock = Clock.fixed(processedAt, ZoneOffset.UTC),
                generateId = { ids.next() },
            )

        val result =
            useCase.process(
                ProcessOrderReceivedCommand(
                    eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f60"),
                    orderId = orderId,
                    correlationId = correlationId,
                ),
            )

        val processedResult = result as ProcessOrderReceivedResult.Processed
        assertEquals(OrderStatus.READY, processedResult.order.status)
        assertEquals("order-processor", fixture.recordedConsumerName)
        assertEquals(processedAt, fixture.recordedAt)
        assertEquals(OrderStatus.READY, fixture.order.status)
        assertEquals(listOf(OrderStatus.RECEIVED, OrderStatus.PROCESSING), fixture.expectedStatuses)
        assertEquals(generatedIds[0], fixture.createdAttempts.single().id)
        assertEquals(ProcessingAttemptStatus.STARTED, fixture.createdAttempts.single().status)
        assertEquals(ProcessingAttemptStatus.SUCCEEDED, fixture.completedAttempts.single().status)
        assertEquals(processedAt, fixture.completedAttempts.single().completedAt)
        assertEquals(
            listOf(OrderTimelineEventType.PROCESSING_STARTED, OrderTimelineEventType.PROCESSING_SUCCEEDED),
            fixture.timelineEntries.map { it.eventType },
        )
        assertEquals(listOf(generatedIds[1], generatedIds[2]), fixture.timelineEntries.map { it.id })
        assertEquals(generatedIds[3], fixture.pendingEvents.single().id)
        assertEquals("OrderReady", fixture.pendingEvents.single().eventType)
        assertEquals(1, fixture.pendingEvents.single().eventVersion)
        assertEquals("{\"status\":\"READY\"}", fixture.pendingEvents.single().payload)
        assertEquals(correlationId, fixture.pendingEvents.single().correlationId)
    }

    @Test
    fun `returns duplicate without applying processing effects`() {
        val fixture = RecordingCollaborators(receivedOrder())
        fixture.processedMessageOutcome = ProcessedMessageRecordOutcome.DUPLICATE
        val useCase = useCase(fixture)
        val eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f60")

        val result =
            useCase.process(
                ProcessOrderReceivedCommand(
                    eventId = eventId,
                    orderId = orderId,
                    correlationId = correlationId,
                ),
            )

        assertEquals(ProcessOrderReceivedResult.Duplicate, result)
        assertEquals("order-processor", fixture.recordedConsumerName)
        assertEquals(eventId, fixture.recordedEventId)
        assertEquals(0, fixture.findByIdCalls)
        assertEquals(emptyList<OrderStatus>(), fixture.expectedStatuses)
        assertEquals(emptyList<ProcessingAttempt>(), fixture.createdAttempts)
        assertEquals(emptyList<OrderTimelineEntry>(), fixture.timelineEntries)
        assertEquals(emptyList<PendingOutboxEvent>(), fixture.pendingEvents)
    }

    private fun useCase(fixture: RecordingCollaborators): ProcessOrderReceivedUseCase {
        val ids = generatedIds.iterator()
        return ProcessOrderReceivedUseCase(
            processedMessageRepository = fixture,
            orderRepository = fixture,
            processingAttemptRepository = fixture,
            orderTimelineRepository = fixture,
            orderReadyPayloadSerializer = fixture,
            pendingOutboxEventRepository = fixture,
            clock = Clock.fixed(processedAt, ZoneOffset.UTC),
            generateId = { ids.next() },
        )
    }

    private fun receivedOrder(): Order {
        val currency = Currency.EUR
        val item =
            OrderItem.create(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53"),
                externalLineId = "line-1",
                sku = "SKU-1",
                description = "Test item",
                quantity = BigDecimal.ONE,
                unitPrice = Money.of(BigDecimal("19.99"), currency),
                position = 0,
            )
        return Order.receive(
            id = orderId,
            sourceSystem = SourceSystem.from("marketplace-a"),
            externalOrderId = ExternalOrderId.from("order-1001"),
            currency = currency,
            items = listOf(item),
            declaredTotalAmount = Money.of(BigDecimal("19.99"), currency),
            receivedAt = processedAt.minusSeconds(2),
        )
    }

    private class RecordingCollaborators(
        var order: Order,
    ) : OrderRepository,
        ProcessedMessageRepository,
        ProcessingAttemptRepository,
        OrderTimelineRepository,
        PendingOutboxEventRepository,
        OrderReadyPayloadSerializer {
        val expectedStatuses = mutableListOf<OrderStatus>()
        val timelineEntries = mutableListOf<OrderTimelineEntry>()
        val createdAttempts = mutableListOf<ProcessingAttempt>()
        val completedAttempts = mutableListOf<ProcessingAttempt>()
        val pendingEvents = mutableListOf<PendingOutboxEvent>()
        var processedMessageOutcome = ProcessedMessageRecordOutcome.RECORDED
        var recordedConsumerName: String? = null
        var recordedEventId: UUID? = null
        var recordedAt: Instant? = null
        var findByIdCalls = 0

        override fun recordIfAbsent(
            consumerName: String,
            eventId: UUID,
            processedAt: Instant,
        ): ProcessedMessageRecordOutcome {
            recordedConsumerName = consumerName
            recordedEventId = eventId
            recordedAt = processedAt
            return processedMessageOutcome
        }

        override fun findById(orderId: OrderId): Order? {
            findByIdCalls++
            return order.takeIf { it.id == orderId }
        }

        override fun updateStatus(
            order: Order,
            expectedStatus: OrderStatus,
        ): Boolean {
            if (this.order.id != order.id || this.order.status != expectedStatus) return false
            expectedStatuses += expectedStatus
            this.order = order
            return true
        }

        override fun create(attempt: ProcessingAttempt) {
            createdAttempts += attempt
        }

        override fun complete(attempt: ProcessingAttempt) {
            completedAttempts += attempt
        }

        override fun append(entry: OrderTimelineEntry) {
            timelineEntries += entry
        }

        override fun append(event: PendingOutboxEvent) {
            pendingEvents += event
        }

        override fun serialize(event: OrderReadyEvent): String = "{\"status\":\"READY\"}"

        override fun insertIfAbsent(
            event: OrderReceivedEvent,
            payloadFingerprint: PayloadFingerprint,
        ): OrderInsertResult = unsupported()

        override fun findBySourceIdentity(
            sourceSystem: SourceSystem,
            externalOrderId: ExternalOrderId,
        ): Order? = unsupported()

        override fun findByIdForSource(
            orderId: OrderId,
            sourceSystem: SourceSystem,
        ): Order? = unsupported()

        private fun <T> unsupported(): T = throw UnsupportedOperationException("Not used by this test")
    }
}
