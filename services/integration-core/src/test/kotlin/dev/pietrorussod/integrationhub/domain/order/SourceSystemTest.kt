package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class SourceSystemTest {
    @Test
    fun `creates a source system without changing it`() {
        val sourceSystem = SourceSystem.from("Marketplace-A")

        assertEquals("Marketplace-A", sourceSystem.value)
    }

    @Test
    fun `rejects source system with surrounding whitespace`() {
        assertThrows(IllegalArgumentException::class.java) {
            SourceSystem.from(" marketplace-a ")
        }
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
