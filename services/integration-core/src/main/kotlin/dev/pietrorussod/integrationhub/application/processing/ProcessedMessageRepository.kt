package dev.pietrorussod.integrationhub.application.processing

import java.time.Instant
import java.util.UUID

interface ProcessedMessageRepository {
    fun recordIfAbsent(
        consumerName: String,
        eventId: UUID,
        processedAt: Instant,
    ): ProcessedMessageRecordOutcome
}
