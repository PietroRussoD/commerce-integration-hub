package dev.pietrorussod.integrationhub.application.outbox

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

class ClaimOutboxEventsUseCaseTest {
    private val now = Instant.parse("2026-08-19T08:00:00Z")
    private val claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70")
    private val repository = RecordingOutboxEventRepository()
    private val useCase =
        ClaimOutboxEventsUseCase(
            outboxEventRepository = repository,
            clock = Clock.fixed(now, ZoneOffset.UTC),
            generateClaimId = { claimId },
        )

    @Test
    fun `claims a validated batch at the current time`() {
        useCase.claim(workerId = "publisher-1", batchSize = 25)

        assertEquals(claimId, repository.claimId)
        assertEquals("publisher-1", repository.workerId)
        assertEquals(now, repository.claimedAt)
        assertEquals(25, repository.batchSize)
    }

    @Test
    fun `rejects an invalid worker id`() {
        listOf("", " ", " publisher-1", "publisher-1 ", "a".repeat(101)).forEach { workerId ->
            assertThrows(IllegalArgumentException::class.java) {
                useCase.claim(workerId = workerId, batchSize = 1)
            }
        }
    }

    @Test
    fun `rejects an invalid batch size`() {
        listOf(0, 101).forEach { batchSize ->
            assertThrows(IllegalArgumentException::class.java) {
                useCase.claim(workerId = "publisher-1", batchSize = batchSize)
            }
        }
    }

    private class RecordingOutboxEventRepository : OutboxEventRepository {
        var claimId: UUID? = null
        var workerId: String? = null
        var claimedAt: Instant? = null
        var batchSize: Int? = null

        override fun claimPending(
            claimId: UUID,
            workerId: String,
            claimedAt: Instant,
            batchSize: Int,
        ): List<ClaimedOutboxEvent> {
            this.claimId = claimId
            this.workerId = workerId
            this.claimedAt = claimedAt
            this.batchSize = batchSize
            return emptyList()
        }

        override fun markPublished(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            publishedAt: Instant,
        ): Boolean = error("Not used")

        override fun rescheduleAfterFailure(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            nextAttemptAt: Instant,
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
