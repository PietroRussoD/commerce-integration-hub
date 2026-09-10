package dev.pietrorussod.integrationhub.application.search

import java.time.Instant

interface OrderSearchProjectionProgressRepository {
    fun current(): OrderSearchProjectionProgress

    fun recordSuccessfulProjection(
        eventOccurredAt: Instant,
        projectedAt: Instant,
    ): Boolean
}

data class OrderSearchProjectionProgress(
    val lastProjectedEventOccurredAt: Instant?,
    val lastProjectedAt: Instant?,
) {
    init {
        require((lastProjectedEventOccurredAt == null) == (lastProjectedAt == null)) {
            "Order search projection progress timestamps must be present together"
        }
        require(lastProjectedAt == null || !lastProjectedAt.isBefore(lastProjectedEventOccurredAt)) {
            "Order search projection completion must not precede the event"
        }
    }
}
