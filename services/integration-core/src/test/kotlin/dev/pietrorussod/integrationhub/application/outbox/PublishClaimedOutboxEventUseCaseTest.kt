package dev.pietrorussod.integrationhub.application.outbox

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class PublishClaimedOutboxEventUseCaseTest {
    private val now = Instant.parse("2026-08-20T08:00:00Z")
    private val event = claimedEvent()

    @Test
    fun `completes an acknowledged publication`() {
        val fixture = fixture(PublicationOutcome.Acknowledged)

        val result = fixture.useCase.publish(event)

        assertEquals(PublishClaimedOutboxEventResult.Published, result)
        assertEquals(Transition.PUBLISHED, fixture.repository.transition)
        assertEquals(event.id, fixture.publisher.publishedEvent?.eventId)
        assertEquals(0, fixture.retryPolicy.calls)
    }

    @Test
    fun `reschedules a retryable publication failure`() {
        val failure = retryableFailure()
        val fixture = fixture(failure, OutboxRetryDecision.RetryAfter(Duration.ofSeconds(30)))

        val result = fixture.useCase.publish(event)

        assertEquals(PublishClaimedOutboxEventResult.Rescheduled(now.plusSeconds(30)), result)
        assertEquals(Transition.RESCHEDULED, fixture.repository.transition)
        assertEquals(now.plusSeconds(30), fixture.repository.nextAttemptAt)
        assertEquals(failure.errorCode, fixture.repository.errorCode)
        assertEquals(1, fixture.retryPolicy.calls)
    }

    @Test
    fun `fails a retryable publication after retry exhaustion`() {
        val failure = retryableFailure()
        val fixture = fixture(failure, OutboxRetryDecision.Exhausted)

        val result = fixture.useCase.publish(event)

        assertEquals(PublishClaimedOutboxEventResult.Failed, result)
        assertEquals(Transition.FAILED, fixture.repository.transition)
        assertEquals(now, fixture.repository.failedAt)
        assertEquals(failure.errorCode, fixture.repository.errorCode)
        assertEquals(1, fixture.retryPolicy.calls)
    }

    @Test
    fun `fails a non-retryable publication without consulting retry policy`() {
        val failure =
            PublicationOutcome.Failed(
                PublicationFailureKind.NON_RETRYABLE,
                "INVALID_EVENT_PAYLOAD",
                "Event payload cannot be published",
            )
        val fixture = fixture(failure)

        val result = fixture.useCase.publish(event)

        assertEquals(PublishClaimedOutboxEventResult.Failed, result)
        assertEquals(Transition.FAILED, fixture.repository.transition)
        assertEquals(0, fixture.retryPolicy.calls)
    }

    @Test
    fun `reports a lost claim when the transition is rejected`() {
        val fixture = fixture(PublicationOutcome.Acknowledged, transitionApplied = false)

        val result = fixture.useCase.publish(event)

        assertEquals(PublishClaimedOutboxEventResult.ClaimLost, result)
    }

    private fun fixture(
        outcome: PublicationOutcome,
        retryDecision: OutboxRetryDecision = OutboxRetryDecision.Exhausted,
        transitionApplied: Boolean = true,
    ): Fixture = Fixture(outcome, retryDecision, transitionApplied, now)

    private fun retryableFailure(): PublicationOutcome.Failed =
        PublicationOutcome.Failed(
            PublicationFailureKind.RETRYABLE,
            "BROKER_UNAVAILABLE",
            "Broker unavailable",
        )

    private fun claimedEvent(): ClaimedOutboxEvent =
        ClaimedOutboxEvent(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
            claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70"),
            workerId = "publisher-1",
            aggregateType = "ORDER",
            aggregateId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            eventType = "OrderReceived",
            eventVersion = 1,
            payload = "{}",
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            createdAt = now.minusSeconds(10),
            publishAttempts = 2,
        )

    private class Fixture(
        outcome: PublicationOutcome,
        retryDecision: OutboxRetryDecision,
        transitionApplied: Boolean,
        now: Instant,
    ) {
        val repository = RecordingOutboxEventRepository(transitionApplied)
        val publisher = RecordingOutboxEventPublisher(outcome)
        val retryPolicy = RecordingOutboxRetryPolicy(retryDecision)
        private val clock = Clock.fixed(now, ZoneOffset.UTC)
        val useCase =
            PublishClaimedOutboxEventUseCase(
                outboxEventPublisher = publisher,
                outboxRetryPolicy = retryPolicy,
                completeOutboxEvent = CompleteOutboxEventUseCase(repository, clock),
                rescheduleOutboxEvent = RescheduleOutboxEventUseCase(repository, clock),
                failOutboxEvent = FailOutboxEventUseCase(repository, clock),
                clock = clock,
            )
    }

    private class RecordingOutboxEventPublisher(
        private val outcome: PublicationOutcome,
    ) : OutboxEventPublisher {
        var publishedEvent: OutboundIntegrationEvent? = null

        override fun publish(event: OutboundIntegrationEvent): PublicationOutcome {
            publishedEvent = event
            return outcome
        }
    }

    private class RecordingOutboxRetryPolicy(
        private val decision: OutboxRetryDecision,
    ) : OutboxRetryPolicy {
        var calls = 0

        override fun decide(publishAttempts: Int): OutboxRetryDecision {
            calls += 1
            return decision
        }
    }

    private class RecordingOutboxEventRepository(
        private val transitionApplied: Boolean,
    ) : OutboxEventRepository {
        var transition: Transition? = null
        var nextAttemptAt: Instant? = null
        var failedAt: Instant? = null
        var errorCode: String? = null

        override fun markPublished(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            publishedAt: Instant,
        ): Boolean {
            transition = Transition.PUBLISHED
            return transitionApplied
        }

        override fun rescheduleAfterFailure(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            nextAttemptAt: Instant,
            errorCode: String,
            safeErrorMessage: String,
        ): Boolean {
            transition = Transition.RESCHEDULED
            this.nextAttemptAt = nextAttemptAt
            this.errorCode = errorCode
            return transitionApplied
        }

        override fun markFailed(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            failedAt: Instant,
            errorCode: String,
            safeErrorMessage: String,
        ): Boolean {
            transition = Transition.FAILED
            this.failedAt = failedAt
            this.errorCode = errorCode
            return transitionApplied
        }

        override fun claimPending(
            claimId: UUID,
            workerId: String,
            claimedAt: Instant,
            batchSize: Int,
        ): List<ClaimedOutboxEvent> = error("Not used")

        override fun recoverExpiredClaims(
            expiredBefore: Instant,
            recoveredAt: Instant,
            batchSize: Int,
        ): List<UUID> = error("Not used")
    }

    private enum class Transition {
        PUBLISHED,
        RESCHEDULED,
        FAILED,
    }
}
