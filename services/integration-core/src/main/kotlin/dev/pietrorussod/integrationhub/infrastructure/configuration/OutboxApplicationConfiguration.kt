package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.outbox.ClaimOutboxEventsUseCase
import dev.pietrorussod.integrationhub.application.outbox.CompleteOutboxEventUseCase
import dev.pietrorussod.integrationhub.application.outbox.FailOutboxEventUseCase
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventRepository
import dev.pietrorussod.integrationhub.application.outbox.RecoverExpiredOutboxClaimsUseCase
import dev.pietrorussod.integrationhub.application.outbox.RescheduleOutboxEventUseCase
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock
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
}
