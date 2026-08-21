package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.processing.OrderTimelineEntry
import dev.pietrorussod.integrationhub.application.processing.OrderTimelineRepository
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.DSLContext
import java.time.ZoneOffset

@ApplicationScoped
class JooqOrderTimelineRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : OrderTimelineRepository {
        override fun append(entry: OrderTimelineEntry) {
            val insertedRows =
                dslContext
                    .insertInto(INTEGRATION_EVENTS)
                    .set(INTEGRATION_EVENTS.ID, entry.id)
                    .set(INTEGRATION_EVENTS.ORDER_ID, entry.orderId.value)
                    .set(INTEGRATION_EVENTS.EVENT_TYPE, entry.eventType.name)
                    .set(INTEGRATION_EVENTS.FROM_STATUS, entry.fromStatus.name)
                    .set(INTEGRATION_EVENTS.TO_STATUS, entry.toStatus.name)
                    .set(INTEGRATION_EVENTS.CORRELATION_ID, entry.correlationId)
                    .set(INTEGRATION_EVENTS.OCCURRED_AT, entry.occurredAt.atOffset(ZoneOffset.UTC))
                    .execute()

            check(insertedRows == 1) {
                "Expected one order timeline insert, got $insertedRows"
            }
        }
    }
