package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchReindexState.Companion.ORDER_SEARCH_REINDEX_STATE
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime
import java.util.UUID

class JooqOrderSearchReindexStateCodeGenerationTest {
    @Test
    fun `generates reindex state metadata from Flyway migrations`() {
        assertEquals("order_search_reindex_state", ORDER_SEARCH_REINDEX_STATE.name)
        assertEquals(String::class.java, ORDER_SEARCH_REINDEX_STATE.OPERATION_NAME.dataType.type)
        assertEquals(String::class.java, ORDER_SEARCH_REINDEX_STATE.PHASE.dataType.type)
        assertEquals(UUID::class.java, ORDER_SEARCH_REINDEX_STATE.LEASE_TOKEN.dataType.type)
        assertEquals(OffsetDateTime::class.java, ORDER_SEARCH_REINDEX_STATE.CURSOR_RECEIVED_AT.dataType.type)
        assertTrue(ORDER_SEARCH_REINDEX_STATE.SOURCE_INDEX.dataType.nullable())
        assertFalse(ORDER_SEARCH_REINDEX_STATE.PHASE.dataType.nullable())
        assertEquals("pk_order_search_reindex_state", ORDER_SEARCH_REINDEX_STATE.primaryKey.name)
    }
}
