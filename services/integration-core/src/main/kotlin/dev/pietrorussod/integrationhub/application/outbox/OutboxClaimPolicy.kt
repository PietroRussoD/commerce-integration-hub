package dev.pietrorussod.integrationhub.application.outbox

internal object OutboxClaimPolicy {
    const val MAX_BATCH_SIZE = 100
    private const val MAX_WORKER_ID_LENGTH = 100

    fun validateWorkerId(workerId: String) {
        require(workerId.isNotBlank()) { "Outbox worker id must not be blank" }
        require(workerId == workerId.trim()) { "Outbox worker id must not have surrounding whitespace" }
        require(workerId.length <= MAX_WORKER_ID_LENGTH) {
            "Outbox worker id must not exceed $MAX_WORKER_ID_LENGTH characters"
        }
    }

    fun validateBatchSize(batchSize: Int) {
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "Outbox batch size must be between 1 and $MAX_BATCH_SIZE"
        }
    }
}
