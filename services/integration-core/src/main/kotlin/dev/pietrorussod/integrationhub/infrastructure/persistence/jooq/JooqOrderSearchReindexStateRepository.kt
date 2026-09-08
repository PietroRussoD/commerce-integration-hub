package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexLease
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexPhase
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexState
import dev.pietrorussod.integrationhub.application.search.OrderSearchReindexStateRepository
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchReindexState.Companion.ORDER_SEARCH_REINDEX_STATE
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.DSLContext
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@ApplicationScoped
class JooqOrderSearchReindexStateRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : OrderSearchReindexStateRepository {
        override fun current(): OrderSearchReindexState =
            requireNotNull(
                dslContext
                    .selectFrom(ORDER_SEARCH_REINDEX_STATE)
                    .where(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.eq(OPERATION_NAME))
                    .fetchOne(),
            ) { "Order search reindex state must be initialized" }.toState()

        override fun tryStart(
            sourceIndex: String,
            candidateIndex: String,
            owner: String,
            token: UUID,
            acquiredAt: Instant,
            expiresAt: Instant,
        ): OrderSearchReindexState? {
            require(sourceIndex.isNotBlank()) { "Order search reindex source index must not be blank" }
            require(candidateIndex.isNotBlank()) { "Order search reindex candidate index must not be blank" }
            require(sourceIndex != candidateIndex) { "Order search reindex indices must differ" }
            validateLease(owner, acquiredAt, expiresAt)

            val started =
                dslContext
                    .update(ORDER_SEARCH_REINDEX_STATE)
                    .set(ORDER_SEARCH_REINDEX_STATE.SOURCE_INDEX, sourceIndex)
                    .set(ORDER_SEARCH_REINDEX_STATE.CANDIDATE_INDEX, candidateIndex)
                    .set(ORDER_SEARCH_REINDEX_STATE.PHASE, OrderSearchReindexPhase.REBUILDING.name)
                    .set(ORDER_SEARCH_REINDEX_STATE.LEASE_OWNER, owner)
                    .set(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN, token)
                    .set(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT, expiresAt.atOffset(ZoneOffset.UTC))
                    .set(ORDER_SEARCH_REINDEX_STATE.VERSION, ORDER_SEARCH_REINDEX_STATE.VERSION.plus(1L))
                    .where(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.eq(OPERATION_NAME))
                    .and(ORDER_SEARCH_REINDEX_STATE.PHASE.eq(OrderSearchReindexPhase.IDLE.name))
                    .and(
                        ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT.isNull
                            .or(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT.le(acquiredAt.atOffset(ZoneOffset.UTC))),
                    ).execute() == 1

            return if (started) current() else null
        }

        override fun tryAcquireLease(
            owner: String,
            token: UUID,
            acquiredAt: Instant,
            expiresAt: Instant,
        ): OrderSearchReindexState? {
            validateLease(owner, acquiredAt, expiresAt)
            val acquired =
                dslContext
                    .update(ORDER_SEARCH_REINDEX_STATE)
                    .set(ORDER_SEARCH_REINDEX_STATE.LEASE_OWNER, owner)
                    .set(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN, token)
                    .set(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT, expiresAt.atOffset(ZoneOffset.UTC))
                    .where(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.eq(OPERATION_NAME))
                    .and(
                        ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT.isNull
                            .or(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT.le(acquiredAt.atOffset(ZoneOffset.UTC))),
                    ).execute() == 1

            return if (acquired) current() else null
        }

        override fun advance(
            expectedVersion: Long,
            leaseToken: UUID,
            cursor: ReadyOrderSearchDocumentCursor,
            progress: OrderSearchReindexProgress,
        ): Boolean {
            require(!progress.isEmpty) { "A reindex checkpoint can advance only after scanning documents" }

            return dslContext
                .update(ORDER_SEARCH_REINDEX_STATE)
                .set(ORDER_SEARCH_REINDEX_STATE.CURSOR_RECEIVED_AT, cursor.receivedAt.atOffset(ZoneOffset.UTC))
                .set(ORDER_SEARCH_REINDEX_STATE.CURSOR_ORDER_ID, cursor.orderId)
                .set(ORDER_SEARCH_REINDEX_STATE.SCANNED_COUNT, ORDER_SEARCH_REINDEX_STATE.SCANNED_COUNT.plus(progress.scannedCount))
                .set(ORDER_SEARCH_REINDEX_STATE.APPLIED_COUNT, ORDER_SEARCH_REINDEX_STATE.APPLIED_COUNT.plus(progress.appliedCount))
                .set(
                    ORDER_SEARCH_REINDEX_STATE.IGNORED_COUNT,
                    ORDER_SEARCH_REINDEX_STATE.IGNORED_COUNT.plus(progress.ignoredNonNewerVersionCount),
                ).set(ORDER_SEARCH_REINDEX_STATE.VERSION, ORDER_SEARCH_REINDEX_STATE.VERSION.plus(1L))
                .where(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.eq(OPERATION_NAME))
                .and(ORDER_SEARCH_REINDEX_STATE.PHASE.eq(OrderSearchReindexPhase.REBUILDING.name))
                .and(ORDER_SEARCH_REINDEX_STATE.VERSION.eq(expectedVersion))
                .and(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN.eq(leaseToken))
                .execute() == 1
        }

        override fun markReadyForCutover(
            expectedVersion: Long,
            leaseToken: UUID,
        ): Boolean =
            dslContext
                .update(ORDER_SEARCH_REINDEX_STATE)
                .set(ORDER_SEARCH_REINDEX_STATE.PHASE, OrderSearchReindexPhase.READY_FOR_CUTOVER.name)
                .set(ORDER_SEARCH_REINDEX_STATE.VERSION, ORDER_SEARCH_REINDEX_STATE.VERSION.plus(1L))
                .where(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.eq(OPERATION_NAME))
                .and(ORDER_SEARCH_REINDEX_STATE.PHASE.eq(OrderSearchReindexPhase.REBUILDING.name))
                .and(ORDER_SEARCH_REINDEX_STATE.VERSION.eq(expectedVersion))
                .and(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN.eq(leaseToken))
                .execute() == 1

        override fun completeCutover(
            expectedVersion: Long,
            leaseToken: UUID,
        ): Boolean =
            dslContext
                .update(ORDER_SEARCH_REINDEX_STATE)
                .setNull(ORDER_SEARCH_REINDEX_STATE.SOURCE_INDEX)
                .setNull(ORDER_SEARCH_REINDEX_STATE.CANDIDATE_INDEX)
                .set(ORDER_SEARCH_REINDEX_STATE.PHASE, OrderSearchReindexPhase.IDLE.name)
                .setNull(ORDER_SEARCH_REINDEX_STATE.CURSOR_RECEIVED_AT)
                .setNull(ORDER_SEARCH_REINDEX_STATE.CURSOR_ORDER_ID)
                .set(ORDER_SEARCH_REINDEX_STATE.SCANNED_COUNT, 0L)
                .set(ORDER_SEARCH_REINDEX_STATE.APPLIED_COUNT, 0L)
                .set(ORDER_SEARCH_REINDEX_STATE.IGNORED_COUNT, 0L)
                .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_OWNER)
                .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN)
                .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT)
                .set(ORDER_SEARCH_REINDEX_STATE.VERSION, ORDER_SEARCH_REINDEX_STATE.VERSION.plus(1L))
                .where(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.eq(OPERATION_NAME))
                .and(ORDER_SEARCH_REINDEX_STATE.PHASE.eq(OrderSearchReindexPhase.READY_FOR_CUTOVER.name))
                .and(ORDER_SEARCH_REINDEX_STATE.VERSION.eq(expectedVersion))
                .and(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN.eq(leaseToken))
                .execute() == 1

        override fun releaseLease(token: UUID): Boolean =
            dslContext
                .update(ORDER_SEARCH_REINDEX_STATE)
                .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_OWNER)
                .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN)
                .setNull(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT)
                .where(ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.eq(OPERATION_NAME))
                .and(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN.eq(token))
                .execute() == 1

        private fun org.jooq.Record.toState(): OrderSearchReindexState {
            val cursorReceivedAt = get(ORDER_SEARCH_REINDEX_STATE.CURSOR_RECEIVED_AT)
            val cursorOrderId = get(ORDER_SEARCH_REINDEX_STATE.CURSOR_ORDER_ID)

            return OrderSearchReindexState(
                version = requireNotNull(get(ORDER_SEARCH_REINDEX_STATE.VERSION)),
                phase = OrderSearchReindexPhase.valueOf(requireNotNull(get(ORDER_SEARCH_REINDEX_STATE.PHASE))),
                sourceIndex = get(ORDER_SEARCH_REINDEX_STATE.SOURCE_INDEX),
                candidateIndex = get(ORDER_SEARCH_REINDEX_STATE.CANDIDATE_INDEX),
                cursor =
                    if (cursorReceivedAt == null && cursorOrderId == null) {
                        null
                    } else {
                        ReadyOrderSearchDocumentCursor(
                            receivedAt = requireNotNull(cursorReceivedAt).toInstant(),
                            orderId = requireNotNull(cursorOrderId),
                        )
                    },
                progress =
                    OrderSearchReindexProgress(
                        scannedCount = requireNotNull(get(ORDER_SEARCH_REINDEX_STATE.SCANNED_COUNT)),
                        appliedCount = requireNotNull(get(ORDER_SEARCH_REINDEX_STATE.APPLIED_COUNT)),
                        ignoredNonNewerVersionCount = requireNotNull(get(ORDER_SEARCH_REINDEX_STATE.IGNORED_COUNT)),
                    ),
                lease =
                    get(ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN)?.let { token ->
                        OrderSearchReindexLease(
                            owner = requireNotNull(get(ORDER_SEARCH_REINDEX_STATE.LEASE_OWNER)),
                            token = token,
                            expiresAt = requireNotNull(get(ORDER_SEARCH_REINDEX_STATE.LEASE_EXPIRES_AT)).toInstant(),
                        )
                    },
            )
        }

        private fun validateLease(
            owner: String,
            acquiredAt: Instant,
            expiresAt: Instant,
        ) {
            require(owner.isNotBlank()) { "Order search reindex lease owner must not be blank" }
            require(expiresAt.isAfter(acquiredAt)) { "Order search reindex lease expiry must be after acquisition" }
        }

        private companion object {
            const val OPERATION_NAME = "order-search"
        }
    }
