package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.application.outbox.PendingOutboxEvent
import dev.pietrorussod.integrationhub.application.outbox.PendingOutboxEventRepository
import dev.pietrorussod.integrationhub.domain.order.Order
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import java.time.Clock
import java.util.UUID

class ProcessOrderReceivedUseCase(
    private val processedMessageRepository: ProcessedMessageRepository,
    private val orderRepository: OrderRepository,
    private val processingAttemptRepository: ProcessingAttemptRepository,
    private val orderTimelineRepository: OrderTimelineRepository,
    private val orderReadyPayloadSerializer: OrderReadyPayloadSerializer,
    private val pendingOutboxEventRepository: PendingOutboxEventRepository,
    private val clock: Clock,
    private val generateId: () -> UUID,
) {
    fun process(command: ProcessOrderReceivedCommand): ProcessOrderReceivedResult {
        val startedAt = clock.instant()
        val inboxOutcome =
            processedMessageRepository.recordIfAbsent(
                consumerName = CONSUMER_NAME,
                eventId = command.eventId,
                processedAt = startedAt,
            )
        if (inboxOutcome == ProcessedMessageRecordOutcome.DUPLICATE) {
            return ProcessOrderReceivedResult.Duplicate
        }

        val receivedOrder =
            orderRepository.findById(command.orderId)
                ?: throw OrderNotFoundForProcessingException(command.orderId)
        if (receivedOrder.status != OrderStatus.RECEIVED) {
            throw OrderProcessingStateConflictException(command.orderId, OrderStatus.RECEIVED)
        }
        val processingOrder = receivedOrder.startProcessing()
        val attempt =
            ProcessingAttempt.start(
                id = generateId(),
                orderId = command.orderId,
                attemptNumber = 1,
                trigger = ProcessingAttemptTrigger.INITIAL,
                startedAt = startedAt,
            )

        processingAttemptRepository.create(attempt)
        if (!orderRepository.updateStatus(processingOrder, OrderStatus.RECEIVED)) {
            throw OrderProcessingStateConflictException(command.orderId, OrderStatus.RECEIVED)
        }
        orderTimelineRepository.append(
            OrderTimelineEntry.processingStarted(
                id = generateId(),
                orderId = command.orderId,
                correlationId = command.correlationId,
                occurredAt = startedAt,
            ),
        )

        val completedAt = clock.instant()
        val readyOrder = processingOrder.markReady()
        if (!orderRepository.updateStatus(readyOrder, OrderStatus.PROCESSING)) {
            throw OrderProcessingStateConflictException(command.orderId, OrderStatus.PROCESSING)
        }
        orderTimelineRepository.append(
            OrderTimelineEntry.processingSucceeded(
                id = generateId(),
                orderId = command.orderId,
                correlationId = command.correlationId,
                occurredAt = completedAt,
            ),
        )
        processingAttemptRepository.complete(attempt.markSucceeded(completedAt))

        val orderReadyEvent =
            OrderReadyEvent(
                id = generateId(),
                correlationId = command.correlationId,
                order = readyOrder,
                occurredAt = completedAt,
            )
        pendingOutboxEventRepository.append(
            PendingOutboxEvent.orderReady(
                event = orderReadyEvent,
                payload = orderReadyPayloadSerializer.serialize(orderReadyEvent),
            ),
        )

        return ProcessOrderReceivedResult.Processed(readyOrder)
    }

    private companion object {
        const val CONSUMER_NAME = "order-processor"
    }
}
