package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class JooqProcessedMessagesCodeGenerationTest {
    @Test
    fun `generates processed message metadata from Flyway migrations`() {
        assertEquals("processed_messages", PROCESSED_MESSAGES.name)
        assertEquals(String::class.java, PROCESSED_MESSAGES.CONSUMER_NAME.dataType.type)
        assertEquals(UUID::class.java, PROCESSED_MESSAGES.EVENT_ID.dataType.type)
        assertEquals(OffsetDateTime::class.java, PROCESSED_MESSAGES.PROCESSED_AT.dataType.type)
        assertFalse(PROCESSED_MESSAGES.PROCESSED_AT.dataType.nullable())
        assertEquals("pk_processed_messages", PROCESSED_MESSAGES.primaryKey.name)
    }
}
