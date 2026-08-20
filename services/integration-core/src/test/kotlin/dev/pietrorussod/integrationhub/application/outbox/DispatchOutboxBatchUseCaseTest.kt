package dev.pietrorussod.integrationhub.application.outbox

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class DispatchOutboxBatchUseCaseTest {
    private val now = Instant.parse("2026-08-20T08:00:00Z")
    private val firstEvent = claimedEvent("018f38c2-1b95-7cc4-bb89-72d26a6f9f61")
    private val secondEvent = claimedEvent("018f38c2-1b95-7cc4-bb89-72d26a6f9f62")

    @Test
    fun `claims and publishes a batch in repository order`() {
        val repository = RecordingOutboxEventRepository(listOf(firstEvent, secondEvent))
        val publisher = RecordingOutboxEventPublisher()
        val useCase = dispatchUseCase(repository, publisher)

        val result = useCase.dispatch(workerId = "publisher-1", batchSize = 25)

        assertEquals("publisher-1", repository.requestedWorkerId)
        assertEquals(25, repository.requestedBatchSize)
        assertEquals(listOf(firstEvent.id, secondEvent.id), publisher.publishedEventIds)
        assertEquals(
            OutboxBatchDispatchResult(
                claimedCount = 2,
                publishedCount = 2,
                rescheduledCount = 0,
                failedCount = 0,
                claimLostCount = 0,
            ),
            result,
        )
    }

    @Test
    fun `summarizes every publication result`() {
        val nextAttemptAt = now.plusSeconds(30)

        val result =
            OutboxBatchDispatchResult.from(
                listOf(
                    PublishClaimedOutboxEventResult.Published,
                    PublishClaimedOutboxEventResult.Rescheduled(nextAttemptAt),
                    PublishClaimedOutboxEventResult.Failed,
                    PublishClaimedOutboxEventResult.ClaimLost,
                ),
            )

        assertEquals(
            OutboxBatchDispatchResult(
                claimedCount = 4,
                publishedCount = 1,
                rescheduledCount = 1,
                failedCount = 1,
                claimLostCount = 1,
            ),
            result,
        )
    }

    @Test
    fun `rejects inconsistent outcome counts`() {
        assertThrows(IllegalArgumentException::class.java) {
            OutboxBatchDispatchResult(-1, 0, 0, 0, -1)
        }
        assertThrows(IllegalArgumentException::class.java) {
            OutboxBatchDispatchResult(2, 1, 0, 0, 0)
        }
    }

    private fun dispatchUseCase(
        repository: OutboxEventRepository,
        publisher: OutboxEventPublisher,
    ): DispatchOutboxBatchUseCase {
        val clock = Clock.fixed(now, ZoneOffset.UTC)
        val claimUseCase = ClaimOutboxEventsUseCase(repository, clock) { UUID.randomUUID() }
        val publishUseCase =
            PublishClaimedOutboxEventUseCase(
                outboxEventPublisher = publisher,
                outboxRetryPolicy = OutboxRetryPolicy { OutboxRetryDecision.Exhausted },
                completeOutboxEvent = CompleteOutboxEventUseCase(repository, clock),
                rescheduleOutboxEvent = RescheduleOutboxEventUseCase(repository, clock),
                failOutboxEvent = FailOutboxEventUseCase(repository, clock),
                clock = clock,
            )
        return DispatchOutboxBatchUseCase(claimUseCase, publishUseCase)
    }

    private fun claimedEvent(id: String): ClaimedOutboxEvent =
        ClaimedOutboxEvent(
            id = UUID.fromString(id),
            claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70"),
            workerId = "publisher-1",
            aggregateType = "ORDER",
            aggregateId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            eventType = "OrderReceived",
            eventVersion = 1,
            payload = "{}",
            correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            createdAt = now.minusSeconds(10),
            publishAttempts = 1,
        )

    private class RecordingOutboxEventPublisher : OutboxEventPublisher {
        val publishedEventIds = mutableListOf<UUID>()

        override fun publish(event: OutboundIntegrationEvent): PublicationOutcome {
            publishedEventIds += event.eventId
            return PublicationOutcome.Acknowledged
        }
    }

    private class RecordingOutboxEventRepository(
        private val claimedEvents: List<ClaimedOutboxEvent>,
    ) : OutboxEventRepository {
        var requestedWorkerId: String? = null
        var requestedBatchSize: Int? = null

        override fun claimPending(
            claimId: UUID,
            workerId: String,
            claimedAt: Instant,
            batchSize: Int,
        ): List<ClaimedOutboxEvent> {
            requestedWorkerId = workerId
            requestedBatchSize = batchSize
            return claimedEvents
        }

        override fun markPublished(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            publishedAt: Instant,
        ): Boolean = true

        override fun rescheduleAfterFailure(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            nextAttemptAt: Instant,
            errorCode: String,
            safeErrorMessage: String,
        ): Boolean = error("Not used")

        override fun markFailed(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            failedAt: Instant,
            errorCode: String,
            safeErrorMessage: String,
        ): Boolean = error("Not used")

        override fun recoverExpiredClaims(
            expiredBefore: Instant,
            recoveredAt: Instant,
            batchSize: Int,
        ): List<UUID> = error("Not used")
    }
}
