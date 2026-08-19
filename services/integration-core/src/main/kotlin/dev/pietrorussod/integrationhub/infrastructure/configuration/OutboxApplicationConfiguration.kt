package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.outbox.ClaimOutboxEventsUseCase
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventRepository
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock

class OutboxApplicationConfiguration {
    @Produces
    @ApplicationScoped
    fun claimOutboxEventsUseCase(outboxEventRepository: OutboxEventRepository): ClaimOutboxEventsUseCase =
        ClaimOutboxEventsUseCase(
            outboxEventRepository = outboxEventRepository,
            clock = Clock.systemUTC(),
        )
}
