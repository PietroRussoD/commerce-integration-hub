package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class ExternalOrderIdTest {
    @Test
    fun `creates an external order id without changing it`() {
        val externalOrderId = ExternalOrderId.from("External-123")

        assertEquals("External-123", externalOrderId.value)
    }

    @Test
    fun `rejects external order id with surrounding whitespace`() {
        assertThrows(IllegalArgumentException::class.java) {
            ExternalOrderId.from(" external-123 ")
        }
    }

    @Test
    fun `rejects blank external order id`() {
        assertThrows(IllegalArgumentException::class.java) {
            ExternalOrderId.from(" ")
        }
    }

    @Test
    fun `rejects external order id longer than 128 characters`() {
        assertThrows(IllegalArgumentException::class.java) {
            ExternalOrderId.from("a".repeat(129))
        }
    }
}
