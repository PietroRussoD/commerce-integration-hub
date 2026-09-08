package dev.pietrorussod.integrationhub.application.search

import java.time.Instant
import java.util.UUID

interface OrderSearchReindexStateRepository {
    fun current(): OrderSearchReindexState

    fun tryStart(
        sourceIndex: String,
        candidateIndex: String,
        owner: String,
        token: UUID,
        acquiredAt: Instant,
        expiresAt: Instant,
    ): OrderSearchReindexState?

    fun tryAcquireLease(
        owner: String,
        token: UUID,
        acquiredAt: Instant,
        expiresAt: Instant,
    ): OrderSearchReindexState?

    fun advance(
        expectedVersion: Long,
        leaseToken: UUID,
        cursor: ReadyOrderSearchDocumentCursor,
        progress: OrderSearchReindexProgress,
    ): Boolean

    fun markReadyForCutover(
        expectedVersion: Long,
        leaseToken: UUID,
    ): Boolean

    fun completeCutover(
        expectedVersion: Long,
        leaseToken: UUID,
    ): Boolean

    fun releaseLease(token: UUID): Boolean
}

data class OrderSearchReindexState(
    val version: Long,
    val phase: OrderSearchReindexPhase,
    val sourceIndex: String?,
    val candidateIndex: String?,
    val cursor: ReadyOrderSearchDocumentCursor?,
    val progress: OrderSearchReindexProgress,
    val lease: OrderSearchReindexLease?,
) {
    init {
        require(version >= 0) { "Order search reindex state version must not be negative" }
        require((sourceIndex == null) == (candidateIndex == null)) {
            "Order search reindex source and candidate indices must be present together"
        }
        require(sourceIndex == null || sourceIndex != candidateIndex) {
            "Order search reindex source and candidate indices must differ"
        }
        require((phase == OrderSearchReindexPhase.IDLE) == (sourceIndex == null)) {
            "Order search reindex indices must be present exactly while an operation is active"
        }
        require((cursor == null) == progress.isEmpty) {
            "Order search reindex cursor must be present exactly while progress exists"
        }
    }

    val isActive: Boolean
        get() = phase != OrderSearchReindexPhase.IDLE
}

enum class OrderSearchReindexPhase {
    IDLE,
    REBUILDING,
    READY_FOR_CUTOVER,
}

data class OrderSearchReindexProgress(
    val scannedCount: Long,
    val appliedCount: Long,
    val ignoredNonNewerVersionCount: Long,
) {
    init {
        require(listOf(scannedCount, appliedCount, ignoredNonNewerVersionCount).all { it >= 0 }) {
            "Order search reindex progress counts must not be negative"
        }
        require(scannedCount == appliedCount + ignoredNonNewerVersionCount) {
            "Order search reindex progress counts must equal the scanned count"
        }
    }

    val isEmpty: Boolean
        get() = scannedCount == 0L
}

data class OrderSearchReindexLease(
    val owner: String,
    val token: UUID,
    val expiresAt: Instant,
) {
    init {
        require(owner.isNotBlank()) { "Order search reindex lease owner must not be blank" }
    }
}
