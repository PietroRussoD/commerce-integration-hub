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

@ApplicationScoped
class JooqOutboxEventRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : OutboxEventRepository {
        @Transactional
        override fun claimPending(
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

        private fun OutboxEventsRecord.toClaimedEvent(): ClaimedOutboxEvent =
            ClaimedOutboxEvent(
                id = requireNotNull(id),
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
        }
    }
