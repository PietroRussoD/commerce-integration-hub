package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import org.jooq.JSON
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.UUID

class JooqEventStorageCodeGenerationTest {
    @Test
    fun `generates integration event metadata from Flyway migrations`() {
        assertEquals("integration_events", INTEGRATION_EVENTS.name)
        assertEquals(UUID::class.java, INTEGRATION_EVENTS.ID.dataType.type)
        assertEquals(JSON::class.java, INTEGRATION_EVENTS.METADATA.dataType.type)
        assertFalse(INTEGRATION_EVENTS.CORRELATION_ID.dataType.nullable())
        assertEquals("pk_integration_events", INTEGRATION_EVENTS.primaryKey.name)
        assertEquals(listOf("fk_integration_events_order"), INTEGRATION_EVENTS.references.map { it.name })
    }

    @Test
    fun `generates outbox metadata from Flyway migrations`() {
        assertEquals("outbox_events", OUTBOX_EVENTS.name)
        assertEquals(UUID::class.java, OUTBOX_EVENTS.ID.dataType.type)
        assertEquals(JSON::class.java, OUTBOX_EVENTS.PAYLOAD.dataType.type)
        assertFalse(OUTBOX_EVENTS.NEXT_ATTEMPT_AT.dataType.nullable())
        assertTrue(OUTBOX_EVENTS.CLAIMED_AT.dataType.nullable())
        assertEquals("pk_outbox_events", OUTBOX_EVENTS.primaryKey.name)
    }
}
