package dev.pietrorussod.integrationhub.application.outbox

import java.time.Instant
import java.util.UUID

interface OutboxEventRepository {
    fun claimPending(
        claimId: UUID,
        workerId: String,
        claimedAt: Instant,
        batchSize: Int,
    ): List<ClaimedOutboxEvent>

    fun markPublished(
        eventId: UUID,
        claimId: UUID,
        workerId: String,
        publishedAt: Instant,
    ): Boolean

    fun rescheduleAfterFailure(
        eventId: UUID,
        claimId: UUID,
        workerId: String,
        nextAttemptAt: Instant,
        errorCode: String,
        safeErrorMessage: String,
    ): Boolean

    fun recoverExpiredClaims(
        expiredBefore: Instant,
        recoveredAt: Instant,
        batchSize: Int,
    ): List<UUID>
}
