package dev.pietrorussod.integrationhub.application.outbox

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class OutboxClaimLifecycleUseCaseTest {
    private val now = Instant.parse("2026-08-19T08:00:00Z")
    private val repository = RecordingOutboxEventRepository()
    private val event = claimedEvent()

    @Test
    fun `completes the exact claim at the current time`() {
        val useCase = CompleteOutboxEventUseCase(repository, Clock.fixed(now, ZoneOffset.UTC))

        assertTrue(useCase.complete(event))

        assertEquals(event.id, repository.eventId)
        assertEquals(event.claimId, repository.claimId)
        assertEquals(event.workerId, repository.workerId)
        assertEquals(now, repository.publishedAt)
    }

    @Test
    fun `reschedules the exact claim with a safe failure`() {
        val useCase = RescheduleOutboxEventUseCase(repository, Clock.fixed(now, ZoneOffset.UTC))
        val nextAttemptAt = now.plusSeconds(30)

        assertTrue(
            useCase.reschedule(
                event = event,
                nextAttemptAt = nextAttemptAt,
                errorCode = "BROKER_UNAVAILABLE",
                safeErrorMessage = "Broker unavailable",
            ),
        )

        assertEquals(event.id, repository.eventId)
        assertEquals(event.claimId, repository.claimId)
        assertEquals(event.workerId, repository.workerId)
        assertEquals(nextAttemptAt, repository.nextAttemptAt)
        assertEquals("BROKER_UNAVAILABLE", repository.errorCode)
        assertEquals("Broker unavailable", repository.safeErrorMessage)
    }

    @Test
    fun `rejects invalid retry data`() {
        val useCase = RescheduleOutboxEventUseCase(repository, Clock.fixed(now, ZoneOffset.UTC))

        listOf(now, now.minusSeconds(1)).forEach { nextAttemptAt ->
            assertThrows(IllegalArgumentException::class.java) {
                useCase.reschedule(event, nextAttemptAt, "BROKER_UNAVAILABLE", "Broker unavailable")
            }
        }
        listOf("", "lowercase", "a".repeat(101)).forEach { errorCode ->
            assertThrows(IllegalArgumentException::class.java) {
                useCase.reschedule(event, now.plusSeconds(1), errorCode, "Broker unavailable")
            }
        }
        listOf("", " message", "message ", "a".repeat(1001)).forEach { message ->
            assertThrows(IllegalArgumentException::class.java) {
                useCase.reschedule(event, now.plusSeconds(1), "BROKER_UNAVAILABLE", message)
            }
        }
    }

    @Test
    fun `recovers claims older than the configured timeout`() {
        val recoveredId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f71")
        repository.recoveredIds = listOf(recoveredId)
        val useCase = RecoverExpiredOutboxClaimsUseCase(repository, Clock.fixed(now, ZoneOffset.UTC))

        val recovered = useCase.recover(claimTimeout = Duration.ofMinutes(2), batchSize = 25)

        assertEquals(listOf(recoveredId), recovered)
        assertEquals(now.minusSeconds(120), repository.expiredBefore)
        assertEquals(now, repository.recoveredAt)
        assertEquals(25, repository.batchSize)
    }

    @Test
    fun `rejects invalid recovery settings`() {
        val useCase = RecoverExpiredOutboxClaimsUseCase(repository, Clock.fixed(now, ZoneOffset.UTC))

        listOf(Duration.ZERO, Duration.ofSeconds(-1)).forEach { timeout ->
            assertThrows(IllegalArgumentException::class.java) {
                useCase.recover(timeout, batchSize = 1)
            }
        }
        listOf(0, 101).forEach { batchSize ->
            assertThrows(IllegalArgumentException::class.java) {
                useCase.recover(Duration.ofMinutes(1), batchSize)
            }
        }
    }

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
            publishAttempts = 1,
        )

    private class RecordingOutboxEventRepository : OutboxEventRepository {
        var eventId: UUID? = null
        var claimId: UUID? = null
        var workerId: String? = null
        var publishedAt: Instant? = null
        var nextAttemptAt: Instant? = null
        var errorCode: String? = null
        var safeErrorMessage: String? = null
        var expiredBefore: Instant? = null
        var recoveredAt: Instant? = null
        var batchSize: Int? = null
        var recoveredIds: List<UUID> = emptyList()

        override fun claimPending(
            claimId: UUID,
            workerId: String,
            claimedAt: Instant,
            batchSize: Int,
        ): List<ClaimedOutboxEvent> = error("Not used")

        override fun markPublished(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            publishedAt: Instant,
        ): Boolean {
            this.eventId = eventId
            this.claimId = claimId
            this.workerId = workerId
            this.publishedAt = publishedAt
            return true
        }

        override fun rescheduleAfterFailure(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            nextAttemptAt: Instant,
            errorCode: String,
            safeErrorMessage: String,
        ): Boolean {
            this.eventId = eventId
            this.claimId = claimId
            this.workerId = workerId
            this.nextAttemptAt = nextAttemptAt
            this.errorCode = errorCode
            this.safeErrorMessage = safeErrorMessage
            return true
        }

        override fun recoverExpiredClaims(
            expiredBefore: Instant,
            recoveredAt: Instant,
            batchSize: Int,
        ): List<UUID> {
            this.expiredBefore = expiredBefore
            this.recoveredAt = recoveredAt
            this.batchSize = batchSize
            return recoveredIds
        }
    }
}
