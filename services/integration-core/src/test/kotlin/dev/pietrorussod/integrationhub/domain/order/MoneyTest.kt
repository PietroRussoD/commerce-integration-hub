package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class MoneyTest {
    @Test
    fun `normalizes insignificant trailing zeros`() {
        val amount = Money.of(BigDecimal("19.9900"), Currency.EUR)

        assertEquals(BigDecimal("19.99"), amount.amount)
    }

    @Test
    fun `keeps currency as part of monetary identity`() {
        val euros = Money.of(BigDecimal("19.99"), Currency.EUR)
        val dollars = Money.of(BigDecimal("19.99"), Currency.USD)

        assertNotEquals(euros, dollars)
    }
}
