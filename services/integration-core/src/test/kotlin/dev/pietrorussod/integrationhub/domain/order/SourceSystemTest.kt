package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class SourceSystemTest {
    @Test
    fun `trims valid source system`() {
        val sourceSystem = SourceSystem.from(" marketplace-a ")

        assertEquals("marketplace-a", sourceSystem.value)
    }

    @Test
    fun `rejects blank source system`() {
        assertThrows(IllegalArgumentException::class.java) {
            SourceSystem.from(" ")
        }
    }

    @Test
    fun `rejects source system longer than 64 characters`() {
        assertThrows(IllegalArgumentException::class.java) {
            SourceSystem.from("a".repeat(65))
        }
    }
}
