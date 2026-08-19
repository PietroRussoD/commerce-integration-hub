package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.outbox.ClaimedOutboxEvent
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventRepository
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.records.OutboxEventsRecord
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import jakarta.transaction.Transactional
import org.jooq.DSLContext
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@ApplicationScoped
class JooqOutboxEventRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : OutboxEventRepository {
        @Transactional
        override fun claimPending(
            claimId: UUID,
            workerId: String,
            claimedAt: Instant,
            batchSize: Int,
        ): List<ClaimedOutboxEvent> {
            val claimTime = claimedAt.atOffset(ZoneOffset.UTC)
            val claimedIds =
                dslContext
                    .select(OUTBOX_EVENTS.ID)
                    .from(OUTBOX_EVENTS)
                    .where(OUTBOX_EVENTS.STATUS.eq(PENDING_STATUS))
                    .and(OUTBOX_EVENTS.NEXT_ATTEMPT_AT.le(claimTime))
                    .orderBy(
                        OUTBOX_EVENTS.NEXT_ATTEMPT_AT,
                        OUTBOX_EVENTS.CREATED_AT,
                        OUTBOX_EVENTS.ID,
                    ).limit(batchSize)
                    .forUpdate()
                    .skipLocked()
                    .fetch(OUTBOX_EVENTS.ID)

            if (claimedIds.isEmpty()) {
                return emptyList()
            }

            dslContext
                .update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.STATUS, PUBLISHING_STATUS)
                .set(OUTBOX_EVENTS.CLAIM_ID, claimId)
                .set(OUTBOX_EVENTS.CLAIMED_BY, workerId)
                .set(OUTBOX_EVENTS.CLAIMED_AT, claimTime)
                .set(
                    OUTBOX_EVENTS.PUBLISH_ATTEMPTS,
                    OUTBOX_EVENTS.PUBLISH_ATTEMPTS.plus(1),
                ).where(OUTBOX_EVENTS.ID.`in`(claimedIds))
                .execute()

            val recordsById =
                dslContext
                    .selectFrom(OUTBOX_EVENTS)
                    .where(OUTBOX_EVENTS.ID.`in`(claimedIds))
                    .fetch()
                    .associateBy { requireNotNull(it.id) }

            return claimedIds.map { id ->
                requireNotNull(recordsById[id]) { "Claimed outbox event $id must still exist" }
                    .toClaimedEvent()
            }
        }

        @Transactional
        override fun markPublished(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            publishedAt: Instant,
        ): Boolean =
            dslContext
                .update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.STATUS, PUBLISHED_STATUS)
                .set(OUTBOX_EVENTS.PUBLISHED_AT, publishedAt.atOffset(ZoneOffset.UTC))
                .setNull(OUTBOX_EVENTS.CLAIM_ID)
                .setNull(OUTBOX_EVENTS.CLAIMED_BY)
                .setNull(OUTBOX_EVENTS.CLAIMED_AT)
                .setNull(OUTBOX_EVENTS.LAST_ERROR_CODE)
                .setNull(OUTBOX_EVENTS.LAST_ERROR_MESSAGE)
                .where(ownedClaimCondition(eventId, claimId, workerId))
                .execute() == 1

        @Transactional
        override fun rescheduleAfterFailure(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
            nextAttemptAt: Instant,
            errorCode: String,
            safeErrorMessage: String,
        ): Boolean =
            dslContext
                .update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.STATUS, PENDING_STATUS)
                .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, nextAttemptAt.atOffset(ZoneOffset.UTC))
                .set(OUTBOX_EVENTS.LAST_ERROR_CODE, errorCode)
                .set(OUTBOX_EVENTS.LAST_ERROR_MESSAGE, safeErrorMessage)
                .setNull(OUTBOX_EVENTS.CLAIM_ID)
                .setNull(OUTBOX_EVENTS.CLAIMED_BY)
                .setNull(OUTBOX_EVENTS.CLAIMED_AT)
                .where(ownedClaimCondition(eventId, claimId, workerId))
                .execute() == 1

        @Transactional
        override fun recoverExpiredClaims(
            expiredBefore: Instant,
            recoveredAt: Instant,
            batchSize: Int,
        ): List<UUID> {
            val expiredIds =
                dslContext
                    .select(OUTBOX_EVENTS.ID)
                    .from(OUTBOX_EVENTS)
                    .where(OUTBOX_EVENTS.STATUS.eq(PUBLISHING_STATUS))
                    .and(OUTBOX_EVENTS.CLAIMED_AT.le(expiredBefore.atOffset(ZoneOffset.UTC)))
                    .orderBy(OUTBOX_EVENTS.CLAIMED_AT, OUTBOX_EVENTS.ID)
                    .limit(batchSize)
                    .forUpdate()
                    .skipLocked()
                    .fetch(OUTBOX_EVENTS.ID)
                    .map(::requireNotNull)

            if (expiredIds.isEmpty()) {
                return emptyList()
            }

            dslContext
                .update(OUTBOX_EVENTS)
                .set(OUTBOX_EVENTS.STATUS, PENDING_STATUS)
                .set(OUTBOX_EVENTS.NEXT_ATTEMPT_AT, recoveredAt.atOffset(ZoneOffset.UTC))
                .set(OUTBOX_EVENTS.LAST_ERROR_CODE, EXPIRED_CLAIM_ERROR_CODE)
                .set(OUTBOX_EVENTS.LAST_ERROR_MESSAGE, EXPIRED_CLAIM_ERROR_MESSAGE)
                .setNull(OUTBOX_EVENTS.CLAIM_ID)
                .setNull(OUTBOX_EVENTS.CLAIMED_BY)
                .setNull(OUTBOX_EVENTS.CLAIMED_AT)
                .where(OUTBOX_EVENTS.ID.`in`(expiredIds))
                .execute()

            return expiredIds
        }

        private fun ownedClaimCondition(
            eventId: UUID,
            claimId: UUID,
            workerId: String,
        ) = OUTBOX_EVENTS.ID
            .eq(eventId)
            .and(OUTBOX_EVENTS.STATUS.eq(PUBLISHING_STATUS))
            .and(OUTBOX_EVENTS.CLAIM_ID.eq(claimId))
            .and(OUTBOX_EVENTS.CLAIMED_BY.eq(workerId))

        private fun OutboxEventsRecord.toClaimedEvent(): ClaimedOutboxEvent =
            ClaimedOutboxEvent(
                id = requireNotNull(id),
                claimId = requireNotNull(claimId),
                workerId = requireNotNull(claimedBy),
                aggregateType = requireNotNull(aggregateType),
                aggregateId = requireNotNull(aggregateId),
                eventType = requireNotNull(eventType),
                eventVersion = requireNotNull(eventVersion),
                payload = requireNotNull(payload).data(),
                correlationId = requireNotNull(correlationId),
                createdAt = requireNotNull(createdAt).toInstant(),
                publishAttempts = requireNotNull(publishAttempts),
            )

        private companion object {
            const val PENDING_STATUS = "PENDING"
            const val PUBLISHING_STATUS = "PUBLISHING"
            const val PUBLISHED_STATUS = "PUBLISHED"
            const val EXPIRED_CLAIM_ERROR_CODE = "CLAIM_EXPIRED"
            const val EXPIRED_CLAIM_ERROR_MESSAGE = "Publisher claim expired before completion"
        }
    }
