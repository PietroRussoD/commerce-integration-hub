package dev.pietrorussod.integrationhub.application.outbox

fun interface PendingOutboxEventRepository {
    fun append(event: PendingOutboxEvent)
}
