package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.processing.ProcessingAttempt
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptRepository
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptStatus
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.DSLContext
import java.time.ZoneOffset

@ApplicationScoped
class JooqProcessingAttemptRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : ProcessingAttemptRepository {
        override fun create(attempt: ProcessingAttempt) {
            require(attempt.status == ProcessingAttemptStatus.STARTED) {
                "Only a started processing attempt can be created"
            }

            val insertedRows =
                dslContext
                    .insertInto(PROCESSING_ATTEMPTS)
                    .set(PROCESSING_ATTEMPTS.ID, attempt.id)
                    .set(PROCESSING_ATTEMPTS.ORDER_ID, attempt.orderId.value)
                    .set(PROCESSING_ATTEMPTS.ATTEMPT_NUMBER, attempt.attemptNumber)
                    .set(PROCESSING_ATTEMPTS.STATUS, attempt.status.name)
                    .set(PROCESSING_ATTEMPTS.TRIGGER_TYPE, attempt.trigger.name)
                    .set(PROCESSING_ATTEMPTS.STARTED_AT, attempt.startedAt.atOffset(ZoneOffset.UTC))
                    .execute()

            check(insertedRows == 1) {
                "Expected one processing attempt insert, got $insertedRows"
            }
        }

        override fun complete(attempt: ProcessingAttempt) {
            require(attempt.status != ProcessingAttemptStatus.STARTED) {
                "A started processing attempt cannot be completed"
            }

            val updatedRows =
                dslContext
                    .update(PROCESSING_ATTEMPTS)
                    .set(PROCESSING_ATTEMPTS.STATUS, attempt.status.name)
                    .set(PROCESSING_ATTEMPTS.ERROR_CODE, attempt.errorCode)
                    .set(PROCESSING_ATTEMPTS.ERROR_MESSAGE, attempt.errorMessage)
                    .set(
                        PROCESSING_ATTEMPTS.COMPLETED_AT,
                        requireNotNull(attempt.completedAt).atOffset(ZoneOffset.UTC),
                    ).where(PROCESSING_ATTEMPTS.ID.eq(attempt.id))
                    .and(PROCESSING_ATTEMPTS.ORDER_ID.eq(attempt.orderId.value))
                    .and(PROCESSING_ATTEMPTS.ATTEMPT_NUMBER.eq(attempt.attemptNumber))
                    .and(PROCESSING_ATTEMPTS.STATUS.eq(ProcessingAttemptStatus.STARTED.name))
                    .execute()

            check(updatedRows == 1) {
                "Processing attempt ${attempt.id} is missing, mismatched, or already completed"
            }
        }
    }
