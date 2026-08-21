package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class JooqProcessingAttemptsCodeGenerationTest {
    @Test
    fun `generates processing attempt metadata from Flyway migrations`() {
        assertEquals("processing_attempts", PROCESSING_ATTEMPTS.name)
        assertEquals(UUID::class.java, PROCESSING_ATTEMPTS.ID.dataType.type)
        assertEquals(Int::class.javaObjectType, PROCESSING_ATTEMPTS.ATTEMPT_NUMBER.dataType.type)
        assertEquals(OffsetDateTime::class.java, PROCESSING_ATTEMPTS.STARTED_AT.dataType.type)
        assertFalse(PROCESSING_ATTEMPTS.STARTED_AT.dataType.nullable())
        assertTrue(PROCESSING_ATTEMPTS.COMPLETED_AT.dataType.nullable())
        assertEquals("pk_processing_attempts", PROCESSING_ATTEMPTS.primaryKey.name)
        assertEquals(
            listOf("uk_processing_attempts_order_number"),
            PROCESSING_ATTEMPTS.uniqueKeys.map { it.name },
        )
    }
}
