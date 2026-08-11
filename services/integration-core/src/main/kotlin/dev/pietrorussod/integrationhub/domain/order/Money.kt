package dev.pietrorussod.integrationhub.domain.order

import java.math.BigDecimal

@ConsistentCopyVisibility
data class Money private constructor(
    val amount: BigDecimal,
    val currency: Currency,
) {
    companion object {
        fun of(
            amount: BigDecimal,
            currency: Currency,
        ): Money =
            Money(
                amount = normalize(amount),
                currency = currency,
            )

        private fun normalize(amount: BigDecimal): BigDecimal =
            if (amount.compareTo(BigDecimal.ZERO) == 0) {
                BigDecimal.ZERO
            } else {
                amount.stripTrailingZeros()
            }
    }
}
