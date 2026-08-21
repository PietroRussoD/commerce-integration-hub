package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.processing.ProcessedMessageRecordOutcome
import dev.pietrorussod.integrationhub.application.processing.ProcessedMessageRepository
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.DSLContext
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@ApplicationScoped
class JooqProcessedMessageRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : ProcessedMessageRepository {
        override fun recordIfAbsent(
            consumerName: String,
            eventId: UUID,
            processedAt: Instant,
        ): ProcessedMessageRecordOutcome {
            val insertedRows =
                dslContext
                    .insertInto(PROCESSED_MESSAGES)
                    .set(PROCESSED_MESSAGES.CONSUMER_NAME, consumerName)
                    .set(PROCESSED_MESSAGES.EVENT_ID, eventId)
                    .set(PROCESSED_MESSAGES.PROCESSED_AT, processedAt.atOffset(ZoneOffset.UTC))
                    .onConflict(PROCESSED_MESSAGES.CONSUMER_NAME, PROCESSED_MESSAGES.EVENT_ID)
                    .doNothing()
                    .execute()

            return when (insertedRows) {
                1 -> ProcessedMessageRecordOutcome.RECORDED
                0 -> ProcessedMessageRecordOutcome.DUPLICATE
                else -> error("Expected at most one processed message insert, got $insertedRows")
            }
        }
    }
