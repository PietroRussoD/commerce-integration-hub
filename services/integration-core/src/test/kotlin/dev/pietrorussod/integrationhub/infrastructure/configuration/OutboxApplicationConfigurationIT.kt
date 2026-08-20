package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.outbox.DispatchOutboxBatchUseCase
import dev.pietrorussod.integrationhub.application.outbox.OutboxRetryDecision
import dev.pietrorussod.integrationhub.application.outbox.OutboxRetryPolicy
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Duration

@QuarkusTest
class OutboxApplicationConfigurationIT {
    @Inject
    lateinit var dispatcher: DispatchOutboxBatchUseCase

    @Inject
    lateinit var retryPolicy: OutboxRetryPolicy

    @Test
    fun `composes the dispatcher with the configured retry policy`() {
        assertNotNull(dispatcher)

        val firstRetry = retryPolicy.decide(publishAttempts = 1)

        assertTrue(firstRetry is OutboxRetryDecision.RetryAfter)
        val delay = (firstRetry as OutboxRetryDecision.RetryAfter).delay
        assertTrue(delay >= Duration.ofSeconds(5))
        assertTrue(delay <= Duration.ofSeconds(10))
        assertEquals(OutboxRetryDecision.Exhausted, retryPolicy.decide(publishAttempts = 5))
    }
}
