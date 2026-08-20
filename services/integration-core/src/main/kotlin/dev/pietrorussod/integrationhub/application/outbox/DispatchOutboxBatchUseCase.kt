package dev.pietrorussod.integrationhub.application.outbox

class DispatchOutboxBatchUseCase(
    private val claimOutboxEvents: ClaimOutboxEventsUseCase,
    private val publishClaimedOutboxEvent: PublishClaimedOutboxEventUseCase,
) {
    fun dispatch(
        workerId: String,
        batchSize: Int,
    ): OutboxBatchDispatchResult {
        val results =
            claimOutboxEvents
                .claim(workerId, batchSize)
                .map(publishClaimedOutboxEvent::publish)

        return OutboxBatchDispatchResult.from(results)
    }
}

data class OutboxBatchDispatchResult(
    val claimedCount: Int,
    val publishedCount: Int,
    val rescheduledCount: Int,
    val failedCount: Int,
    val claimLostCount: Int,
) {
    init {
        require(listOf(claimedCount, publishedCount, rescheduledCount, failedCount, claimLostCount).all { it >= 0 }) {
            "Outbox dispatch outcome counts must not be negative"
        }
        require(claimedCount == publishedCount + rescheduledCount + failedCount + claimLostCount) {
            "Outbox dispatch outcome counts must equal the claimed event count"
        }
    }

    companion object {
        internal fun from(results: List<PublishClaimedOutboxEventResult>): OutboxBatchDispatchResult =
            OutboxBatchDispatchResult(
                claimedCount = results.size,
                publishedCount = results.count { it is PublishClaimedOutboxEventResult.Published },
                rescheduledCount = results.count { it is PublishClaimedOutboxEventResult.Rescheduled },
                failedCount = results.count { it is PublishClaimedOutboxEventResult.Failed },
                claimLostCount = results.count { it is PublishClaimedOutboxEventResult.ClaimLost },
            )
    }
}
