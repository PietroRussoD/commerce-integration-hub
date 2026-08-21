package dev.pietrorussod.integrationhub.infrastructure.persistence

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.exception.DataAccessException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

@QuarkusTest
class ProcessedMessagesMigrationIT {
    @Inject
    lateinit var dslContext: DSLContext

    private val fixedProcessedAt = OffsetDateTime.parse("2026-08-21T08:00:00Z")

    @BeforeEach
    fun deleteProcessedMessages() {
        dslContext.deleteFrom(PROCESSED_MESSAGES).execute()
    }

    @Test
    fun `stores a processed event for a consumer`() {
        val eventId = UUID.randomUUID()

        insertProcessedMessage(eventId = eventId)

        val processedMessage = dslContext.selectFrom(PROCESSED_MESSAGES).fetchSingle()
        assertEquals("order-processor", processedMessage.consumerName)
        assertEquals(eventId, processedMessage.eventId)
        assertEquals(fixedProcessedAt.toInstant(), processedMessage.processedAt?.toInstant())
    }

    @Test
    fun `rejects the same event for the same consumer`() {
        val eventId = UUID.randomUUID()
        insertProcessedMessage(eventId = eventId)

        assertThrows(DataAccessException::class.java) {
            insertProcessedMessage(eventId = eventId)
        }
    }

    @Test
    fun `allows different consumers to process the same event`() {
        val eventId = UUID.randomUUID()

        insertProcessedMessage(consumerName = "order-processor", eventId = eventId)
        insertProcessedMessage(consumerName = "search-projector", eventId = eventId)

        assertEquals(2, dslContext.fetchCount(PROCESSED_MESSAGES))
    }

    @Test
    fun `rejects a blank consumer name`() {
        assertThrows(DataAccessException::class.java) {
            insertProcessedMessage(consumerName = "   ")
        }
    }

    private fun insertProcessedMessage(
        consumerName: String = "order-processor",
        eventId: UUID = UUID.randomUUID(),
    ) {
        dslContext
            .insertInto(PROCESSED_MESSAGES)
            .set(PROCESSED_MESSAGES.CONSUMER_NAME, consumerName)
            .set(PROCESSED_MESSAGES.EVENT_ID, eventId)
            .set(PROCESSED_MESSAGES.PROCESSED_AT, fixedProcessedAt)
            .execute()
    }
}
