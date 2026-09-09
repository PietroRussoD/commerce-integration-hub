package dev.pietrorussod.integrationhub.application.search

import java.time.Clock
import java.time.Duration
import java.util.UUID

class RunOrderSearchReindexUseCase(
    private val reindexStateRepository: OrderSearchReindexStateRepository,
    private val indexManager: OrderSearchReindexIndexManager,
    private val rebuildOrderSearchIndex: RebuildOrderSearchIndexUseCase,
    private val validateOrderSearchReindex: ValidateOrderSearchReindexUseCase,
    private val clock: Clock,
) {
    fun run(
        owner: String,
        leaseDuration: Duration,
        batchSize: Int,
    ): OrderSearchReindexRunResult {
        require(owner.isNotBlank()) { "Order search reindex lease owner must not be blank" }
        require(!leaseDuration.isNegative && !leaseDuration.isZero) {
            "Order search reindex lease duration must be positive"
        }
        require(batchSize in 1..MAX_BATCH_SIZE) {
            "Order search reindex batch size must be between 1 and $MAX_BATCH_SIZE"
        }

        val leaseToken = UUID.randomUUID()
        val now = clock.instant()
        val state = acquireState(owner, leaseToken, now, leaseDuration) ?: return OrderSearchReindexRunResult.LeaseUnavailable

        try {
            return when (state.phase) {
                OrderSearchReindexPhase.PREPARING -> prepareCandidate(state, leaseToken)
                OrderSearchReindexPhase.REBUILDING -> rebuild(state, leaseToken, batchSize)
                OrderSearchReindexPhase.READY_FOR_CUTOVER -> cutOver(state, leaseToken)
                OrderSearchReindexPhase.IDLE -> error("An acquired order search reindex state must be active")
            }
        } finally {
            reindexStateRepository.releaseLease(leaseToken)
        }
    }

    private fun acquireState(
        owner: String,
        leaseToken: UUID,
        now: java.time.Instant,
        leaseDuration: Duration,
    ): OrderSearchReindexState? {
        val expiresAt = now.plus(leaseDuration)
        val current = reindexStateRepository.current()
        return if (current.phase == OrderSearchReindexPhase.IDLE) {
            val indices = indexManager.planCandidate()
            reindexStateRepository.tryStart(
                sourceIndex = indices.sourceIndex,
                candidateIndex = indices.candidateIndex,
                owner = owner,
                token = leaseToken,
                acquiredAt = now,
                expiresAt = expiresAt,
            )
        } else {
            reindexStateRepository.tryAcquireLease(
                owner = owner,
                token = leaseToken,
                acquiredAt = now,
                expiresAt = expiresAt,
            )
        }
    }

    private fun prepareCandidate(
        state: OrderSearchReindexState,
        leaseToken: UUID,
    ): OrderSearchReindexRunResult {
        indexManager.createCandidate(requireNotNull(state.candidateIndex))
        return if (reindexStateRepository.markRebuilding(state.version, leaseToken)) {
            OrderSearchReindexRunResult.CandidatePrepared
        } else {
            OrderSearchReindexRunResult.StateChanged
        }
    }

    private fun rebuild(
        state: OrderSearchReindexState,
        leaseToken: UUID,
        batchSize: Int,
    ): OrderSearchReindexRunResult {
        val batch =
            rebuildOrderSearchIndex.rebuild(
                candidateIndex = requireNotNull(state.candidateIndex),
                after = state.cursor,
                batchSize = batchSize,
            )
        if (batch.scannedCount == 0) {
            return if (reindexStateRepository.markReadyForCutover(state.version, leaseToken)) {
                OrderSearchReindexRunResult.ReadyForCutover
            } else {
                OrderSearchReindexRunResult.StateChanged
            }
        }

        val cursor = requireNotNull(batch.nextCursor) { "A non-empty reindex batch must have a cursor" }
        return if (reindexStateRepository.advance(state.version, leaseToken, cursor, batch.toProgress())) {
            OrderSearchReindexRunResult.Advanced(batch)
        } else {
            OrderSearchReindexRunResult.StateChanged
        }
    }

    private fun cutOver(
        state: OrderSearchReindexState,
        leaseToken: UUID,
    ): OrderSearchReindexRunResult {
        val validation = validateOrderSearchReindex.validate(requireNotNull(state.candidateIndex))
        if (!validation.isValid) {
            return OrderSearchReindexRunResult.ValidationFailed(validation)
        }

        val outcome =
            indexManager.cutOver(
                OrderSearchReindexIndices(
                    sourceIndex = requireNotNull(state.sourceIndex),
                    candidateIndex = requireNotNull(state.candidateIndex),
                ),
            )
        return if (reindexStateRepository.completeCutover(state.version, leaseToken)) {
            OrderSearchReindexRunResult.Completed(outcome)
        } else {
            OrderSearchReindexRunResult.StateChanged
        }
    }

    private companion object {
        const val MAX_BATCH_SIZE = 500
    }
}

sealed interface OrderSearchReindexRunResult {
    data object CandidatePrepared : OrderSearchReindexRunResult

    data class Advanced(
        val batch: OrderSearchReindexBatchResult,
    ) : OrderSearchReindexRunResult

    data object ReadyForCutover : OrderSearchReindexRunResult

    data class ValidationFailed(
        val validation: OrderSearchReindexValidationResult,
    ) : OrderSearchReindexRunResult

    data class Completed(
        val outcome: OrderSearchReindexCutoverOutcome,
    ) : OrderSearchReindexRunResult

    data object StateChanged : OrderSearchReindexRunResult

    data object LeaseUnavailable : OrderSearchReindexRunResult
}
