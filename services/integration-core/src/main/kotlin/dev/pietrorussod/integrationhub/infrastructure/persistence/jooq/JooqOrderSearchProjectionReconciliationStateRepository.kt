package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationBatchResult
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationCompletedRun
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationLease
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationState
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionReconciliationStateRepository
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchProjectionReconciliationState.Companion.ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.DSLContext
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@ApplicationScoped
class JooqOrderSearchProjectionReconciliationStateRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : OrderSearchProjectionReconciliationStateRepository {
        override fun current(): OrderSearchProjectionReconciliationState =
            requireNotNull(
                dslContext
                    .selectFrom(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE)
                    .where(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.PROJECTION_NAME.eq(PROJECTION_NAME))
                    .fetchOne(),
            ) { "Order search reconciliation state must be initialized" }.toState()

        override fun tryAcquireLease(
            owner: String,
            token: UUID,
            acquiredAt: Instant,
            expiresAt: Instant,
        ): OrderSearchProjectionReconciliationState? {
            require(owner.isNotBlank()) { "Order search reconciliation lease owner must not be blank" }
            require(expiresAt.isAfter(acquiredAt)) { "Order search reconciliation lease expiry must be after acquisition" }

            val acquired =
                dslContext
                    .update(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE)
                    .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_OWNER, owner)
                    .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_TOKEN, token)
                    .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_EXPIRES_AT, expiresAt.atOffset(ZoneOffset.UTC))
                    .where(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.PROJECTION_NAME.eq(PROJECTION_NAME))
                    .and(
                        ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_EXPIRES_AT.isNull
                            .or(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_EXPIRES_AT.le(acquiredAt.atOffset(ZoneOffset.UTC))),
                    ).execute() == 1

            return if (acquired) current() else null
        }

        override fun releaseLease(token: UUID): Boolean =
            dslContext
                .update(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE)
                .setNull(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_OWNER)
                .setNull(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_TOKEN)
                .setNull(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_EXPIRES_AT)
                .where(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.PROJECTION_NAME.eq(PROJECTION_NAME))
                .and(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_TOKEN.eq(token))
                .execute() == 1

        override fun advance(
            expectedVersion: Long,
            cursor: ReadyOrderSearchDocumentCursor,
            batch: OrderSearchProjectionReconciliationBatchResult,
        ): Boolean {
            require(batch.scannedCount > 0) { "A reconciliation checkpoint can advance only after scanning documents" }
            require(batch.nextCursor == cursor) { "Reconciliation checkpoint cursor must match the batch continuation cursor" }

            return dslContext
                .update(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE)
                .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURSOR_RECEIVED_AT, cursor.receivedAt.atOffset(ZoneOffset.UTC))
                .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURSOR_ORDER_ID, cursor.orderId)
                .set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_SCANNED_COUNT,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_SCANNED_COUNT.plus(batch.scannedCount.toLong()),
                ).set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_APPLIED_COUNT,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_APPLIED_COUNT.plus(batch.appliedCount.toLong()),
                ).set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_IGNORED_NON_NEWER_VERSION_COUNT,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_IGNORED_NON_NEWER_VERSION_COUNT.plus(
                        batch.ignoredNonNewerVersionCount.toLong(),
                    ),
                ).set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.VERSION,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.VERSION.plus(1L),
                ).where(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.PROJECTION_NAME.eq(PROJECTION_NAME))
                .and(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.VERSION.eq(expectedVersion))
                .execute() == 1
        }

        override fun complete(
            expectedVersion: Long,
            completedAt: Instant,
        ): Boolean =
            dslContext
                .update(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE)
                .setNull(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURSOR_RECEIVED_AT)
                .setNull(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURSOR_ORDER_ID)
                .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LAST_COMPLETED_AT, completedAt.atOffset(ZoneOffset.UTC))
                .set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LAST_COMPLETED_SCANNED_COUNT,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_SCANNED_COUNT,
                ).set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LAST_COMPLETED_APPLIED_COUNT,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_APPLIED_COUNT,
                ).set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LAST_COMPLETED_IGNORED_NON_NEWER_VERSION_COUNT,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_IGNORED_NON_NEWER_VERSION_COUNT,
                ).set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_SCANNED_COUNT, 0L)
                .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_APPLIED_COUNT, 0L)
                .set(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_IGNORED_NON_NEWER_VERSION_COUNT, 0L)
                .set(
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.VERSION,
                    ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.VERSION.plus(1L),
                ).where(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.PROJECTION_NAME.eq(PROJECTION_NAME))
                .and(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.VERSION.eq(expectedVersion))
                .execute() == 1

        private fun org.jooq.Record.toState(): OrderSearchProjectionReconciliationState {
            val currentRun =
                OrderSearchProjectionReconciliationProgress(
                    scannedCount = requireNotNull(get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_SCANNED_COUNT)),
                    appliedCount = requireNotNull(get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_APPLIED_COUNT)),
                    ignoredNonNewerVersionCount =
                        requireNotNull(get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURRENT_IGNORED_NON_NEWER_VERSION_COUNT)),
                )
            val cursorReceivedAt = get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURSOR_RECEIVED_AT)
            val cursorOrderId = get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.CURSOR_ORDER_ID)
            val lastCompletedAt = get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LAST_COMPLETED_AT)

            return OrderSearchProjectionReconciliationState(
                version = requireNotNull(get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.VERSION)),
                cursor =
                    if (cursorReceivedAt == null && cursorOrderId == null) {
                        null
                    } else {
                        ReadyOrderSearchDocumentCursor(
                            receivedAt = requireNotNull(cursorReceivedAt).toInstant(),
                            orderId = requireNotNull(cursorOrderId),
                        )
                    },
                lease =
                    get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_TOKEN)?.let { token ->
                        OrderSearchProjectionReconciliationLease(
                            owner = requireNotNull(get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_OWNER)),
                            token = token,
                            expiresAt =
                                requireNotNull(
                                    get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LEASE_EXPIRES_AT),
                                ).toInstant(),
                        )
                    },
                currentRun = currentRun,
                lastCompletedRun =
                    lastCompletedAt?.let { completedAt ->
                        OrderSearchProjectionReconciliationCompletedRun(
                            completedAt = completedAt.toInstant(),
                            progress =
                                OrderSearchProjectionReconciliationProgress(
                                    scannedCount =
                                        requireNotNull(
                                            get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LAST_COMPLETED_SCANNED_COUNT),
                                        ),
                                    appliedCount =
                                        requireNotNull(
                                            get(ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE.LAST_COMPLETED_APPLIED_COUNT),
                                        ),
                                    ignoredNonNewerVersionCount =
                                        requireNotNull(
                                            get(
                                                ORDER_SEARCH_PROJECTION_RECONCILIATION_STATE
                                                    .LAST_COMPLETED_IGNORED_NON_NEWER_VERSION_COUNT,
                                            ),
                                        ),
                                ),
                        )
                    },
            )
        }

        private companion object {
            const val PROJECTION_NAME = "order-search"
        }
    }
