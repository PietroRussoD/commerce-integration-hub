package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.order.OrderRepository
import dev.pietrorussod.integrationhub.application.outbox.PendingOutboxEventRepository
import dev.pietrorussod.integrationhub.application.processing.OrderReadyPayloadSerializer
import dev.pietrorussod.integrationhub.application.processing.OrderTimelineRepository
import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedUseCase
import dev.pietrorussod.integrationhub.application.processing.ProcessedMessageRepository
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock
import java.util.UUID

class ProcessingApplicationConfiguration {
    @Produces
    @ApplicationScoped
    fun processOrderReceivedUseCase(
        processedMessageRepository: ProcessedMessageRepository,
        orderRepository: OrderRepository,
        processingAttemptRepository: ProcessingAttemptRepository,
        orderTimelineRepository: OrderTimelineRepository,
        orderReadyPayloadSerializer: OrderReadyPayloadSerializer,
        pendingOutboxEventRepository: PendingOutboxEventRepository,
    ): ProcessOrderReceivedUseCase =
        ProcessOrderReceivedUseCase(
            processedMessageRepository = processedMessageRepository,
            orderRepository = orderRepository,
            processingAttemptRepository = processingAttemptRepository,
            orderTimelineRepository = orderTimelineRepository,
            orderReadyPayloadSerializer = orderReadyPayloadSerializer,
            pendingOutboxEventRepository = pendingOutboxEventRepository,
            clock = Clock.systemUTC(),
            generateId = UUID::randomUUID,
        )
}
