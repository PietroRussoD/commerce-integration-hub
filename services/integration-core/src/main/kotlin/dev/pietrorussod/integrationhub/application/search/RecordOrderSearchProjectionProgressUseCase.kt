package dev.pietrorussod.integrationhub.application.search

import java.time.Clock
import java.time.Instant

class RecordOrderSearchProjectionProgressUseCase(
    private val progressRepository: OrderSearchProjectionProgressRepository,
    private val clock: Clock,
) {
    fun record(eventOccurredAt: Instant) {
        progressRepository.recordSuccessfulProjection(eventOccurredAt, clock.instant())
    }
}
