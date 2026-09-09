package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgressRepository
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchProjectionProgress.Companion.ORDER_SEARCH_PROJECTION_PROGRESS
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.DSLContext
import java.time.Instant
import java.time.ZoneOffset

@ApplicationScoped
class JooqOrderSearchProjectionProgressRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : OrderSearchProjectionProgressRepository {
        override fun current(): OrderSearchProjectionProgress =
            requireNotNull(
                dslContext
                    .selectFrom(ORDER_SEARCH_PROJECTION_PROGRESS)
                    .where(ORDER_SEARCH_PROJECTION_PROGRESS.PROJECTION_NAME.eq(PROJECTION_NAME))
                    .fetchOne(),
            ) { "Order search projection progress must be initialized" }.toProgress()

        override fun recordSuccessfulProjection(
            eventOccurredAt: Instant,
            projectedAt: Instant,
        ) {
            require(!projectedAt.isBefore(eventOccurredAt)) {
                "Order search projection completion must not precede the event"
            }

            dslContext
                .update(ORDER_SEARCH_PROJECTION_PROGRESS)
                .set(
                    ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_EVENT_OCCURRED_AT,
                    eventOccurredAt.atOffset(ZoneOffset.UTC),
                ).set(ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_AT, projectedAt.atOffset(ZoneOffset.UTC))
                .where(ORDER_SEARCH_PROJECTION_PROGRESS.PROJECTION_NAME.eq(PROJECTION_NAME))
                .and(
                    ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_EVENT_OCCURRED_AT.isNull.or(
                        ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_EVENT_OCCURRED_AT.lt(eventOccurredAt.atOffset(ZoneOffset.UTC)),
                    ),
                ).execute()
        }

        private fun org.jooq.Record.toProgress(): OrderSearchProjectionProgress =
            OrderSearchProjectionProgress(
                lastProjectedEventOccurredAt =
                    get(ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_EVENT_OCCURRED_AT)?.toInstant(),
                lastProjectedAt = get(ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_AT)?.toInstant(),
            )

        private companion object {
            const val PROJECTION_NAME = "order-search"
        }
    }
