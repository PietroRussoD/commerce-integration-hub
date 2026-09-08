package dev.pietrorussod.integrationhub.infrastructure.search

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class OpenSearchOrderIndexLifecycleTest {
    @Test
    fun `builds an atomic read alias cutover`() {
        val request = OpenSearchOrderIndexLifecycle.buildCutOverRequest("orders-v1", "orders-v2")

        assertEquals(2, request.actions().size)
        assertTrue(request.actions()[0].isRemove())
        assertEquals("orders-v1", request.actions()[0].remove().index())
        assertEquals(OpenSearchOrderIndexDefinition.READ_ALIAS, request.actions()[0].remove().alias())
        assertEquals(true, request.actions()[0].remove().mustExist())
        assertTrue(request.actions()[1].isAdd())
        assertEquals("orders-v2", request.actions()[1].add().index())
        assertEquals(OpenSearchOrderIndexDefinition.READ_ALIAS, request.actions()[1].add().alias())
        assertEquals(true, request.actions()[1].add().isWriteIndex())
    }

    @Test
    fun `rejects invalid or unchanged cutover targets`() {
        assertThrows(IllegalArgumentException::class.java) {
            OpenSearchOrderIndexLifecycle.buildCutOverRequest("orders-v1", "orders-next")
        }
        assertThrows(IllegalArgumentException::class.java) {
            OpenSearchOrderIndexLifecycle.buildCutOverRequest("orders-v1", "orders-v1")
        }
        assertFalse(OpenSearchOrderIndexDefinition.isVersionedOrderIndex("orders-next"))
    }
}
