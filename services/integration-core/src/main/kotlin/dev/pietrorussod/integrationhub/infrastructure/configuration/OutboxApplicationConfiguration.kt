package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.outbox.BoundedExponentialBackoffRetryPolicy
import dev.pietrorussod.integrationhub.application.outbox.ClaimOutboxEventsUseCase
import dev.pietrorussod.integrationhub.application.outbox.CompleteOutboxEventUseCase
import dev.pietrorussod.integrationhub.application.outbox.DispatchOutboxBatchUseCase
import dev.pietrorussod.integrationhub.application.outbox.FailOutboxEventUseCase
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventPublisher
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventRepository
import dev.pietrorussod.integrationhub.application.outbox.OutboxRetryPolicy
import dev.pietrorussod.integrationhub.application.outbox.PublishClaimedOutboxEventUseCase
import dev.pietrorussod.integrationhub.application.outbox.RecoverExpiredOutboxClaimsUseCase
import dev.pietrorussod.integrationhub.application.outbox.RescheduleOutboxEventUseCase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.time.Clock
import java.time.Duration
import java.util.UUID

class OutboxApplicationConfiguration {
    @Produces
    @ApplicationScoped
    fun claimOutboxEventsUseCase(outboxEventRepository: OutboxEventRepository): ClaimOutboxEventsUseCase =
        ClaimOutboxEventsUseCase(
            outboxEventRepository = outboxEventRepository,
            clock = Clock.systemUTC(),
            generateClaimId = UUID::randomUUID,
        )

    @Produces
    @ApplicationScoped
    fun completeOutboxEventUseCase(outboxEventRepository: OutboxEventRepository): CompleteOutboxEventUseCase =
        CompleteOutboxEventUseCase(outboxEventRepository, Clock.systemUTC())

    @Produces
    @ApplicationScoped
    fun rescheduleOutboxEventUseCase(outboxEventRepository: OutboxEventRepository): RescheduleOutboxEventUseCase =
        RescheduleOutboxEventUseCase(outboxEventRepository, Clock.systemUTC())

    @Produces
    @ApplicationScoped
    fun failOutboxEventUseCase(outboxEventRepository: OutboxEventRepository): FailOutboxEventUseCase =
        FailOutboxEventUseCase(outboxEventRepository, Clock.systemUTC())

    @Produces
    @ApplicationScoped
    fun recoverExpiredOutboxClaimsUseCase(outboxEventRepository: OutboxEventRepository): RecoverExpiredOutboxClaimsUseCase =
        RecoverExpiredOutboxClaimsUseCase(outboxEventRepository, Clock.systemUTC())

    @Produces
    @ApplicationScoped
    fun outboxRetryPolicy(
        @ConfigProperty(name = "integration-hub.outbox.retry.base-delay") baseDelay: Duration,
        @ConfigProperty(name = "integration-hub.outbox.retry.maximum-delay") maximumDelay: Duration,
        @ConfigProperty(name = "integration-hub.outbox.retry.maximum-attempts") maximumAttempts: Int,
    ): OutboxRetryPolicy =
        BoundedExponentialBackoffRetryPolicy(
            baseDelay = baseDelay,
            maxDelay = maximumDelay,
            maxAttempts = maximumAttempts,
        )

    @Produces
    @ApplicationScoped
    fun publishClaimedOutboxEventUseCase(
        outboxEventPublisher: OutboxEventPublisher,
        outboxRetryPolicy: OutboxRetryPolicy,
        completeOutboxEvent: CompleteOutboxEventUseCase,
        rescheduleOutboxEvent: RescheduleOutboxEventUseCase,
        failOutboxEvent: FailOutboxEventUseCase,
    ): PublishClaimedOutboxEventUseCase =
        PublishClaimedOutboxEventUseCase(
            outboxEventPublisher = outboxEventPublisher,
            outboxRetryPolicy = outboxRetryPolicy,
            completeOutboxEvent = completeOutboxEvent,
            rescheduleOutboxEvent = rescheduleOutboxEvent,
            failOutboxEvent = failOutboxEvent,
            clock = Clock.systemUTC(),
        )

    @Produces
    @ApplicationScoped
    fun dispatchOutboxBatchUseCase(
        claimOutboxEvents: ClaimOutboxEventsUseCase,
        publishClaimedOutboxEvent: PublishClaimedOutboxEventUseCase,
    ): DispatchOutboxBatchUseCase = DispatchOutboxBatchUseCase(claimOutboxEvents, publishClaimedOutboxEvent)
}
