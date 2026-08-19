package dev.pietrorussod.integrationhub.application.outbox

import java.time.Instant

interface OutboxEventRepository {
    fun claimPending(
        workerId: String,
        claimedAt: Instant,
        batchSize: Int,
    ): List<ClaimedOutboxEvent>
}
