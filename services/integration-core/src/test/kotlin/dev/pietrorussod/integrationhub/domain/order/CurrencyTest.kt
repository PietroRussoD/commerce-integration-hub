package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class CurrencyTest {
    @Test
    fun `creates a supported currency from its canonical code`() {
        assertEquals(Currency.EUR, Currency.from("EUR"))
    }

    @Test
    fun `rejects a lowercase currency code`() {
        assertThrows(IllegalArgumentException::class.java) {
            Currency.from("eur")
        }
    }

    @Test
    fun `rejects currency code with surrounding whitespace`() {
        assertThrows(IllegalArgumentException::class.java) {
            Currency.from(" EUR ")
        }
    }

    @Test
    fun `rejects an unsupported currency`() {
        assertThrows(IllegalArgumentException::class.java) {
            Currency.from("CHF")
        }
    }
}
