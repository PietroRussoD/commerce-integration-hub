package dev.pietrorussod.integrationhub.application.outbox

import java.time.Instant

/**
 * The outbox events not published yet. Waiting events are pending or claimed by a
 * publisher and will still be published; failed events reached a terminal failure
 * and need an operator.
 */
data class OutboxBacklog(
    val waitingEvents: Long,
    val oldestWaitingCreatedAt: Instant?,
    val failedEvents: Long,
) {
    init {
        require(waitingEvents >= 0) { "Waiting outbox event count must not be negative" }
        require(failedEvents >= 0) { "Failed outbox event count must not be negative" }
        require((waitingEvents == 0L) == (oldestWaitingCreatedAt == null)) {
            "The oldest waiting outbox event must be known exactly when events are waiting"
        }
    }
}

fun interface OutboxBacklogReader {
    fun read(): OutboxBacklog
}
