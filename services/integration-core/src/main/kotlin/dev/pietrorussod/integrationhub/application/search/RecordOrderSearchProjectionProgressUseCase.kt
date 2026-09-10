package dev.pietrorussod.integrationhub.application.search

import java.time.Clock
import java.time.Instant

class RecordOrderSearchProjectionProgressUseCase(
    private val progressRepository: OrderSearchProjectionProgressRepository,
    private val clock: Clock,
) {
    fun record(eventOccurredAt: Instant): Instant? {
        val projectedAt = clock.instant()
        return projectedAt.takeIf { progressRepository.recordSuccessfulProjection(eventOccurredAt, it) }
    }
}
