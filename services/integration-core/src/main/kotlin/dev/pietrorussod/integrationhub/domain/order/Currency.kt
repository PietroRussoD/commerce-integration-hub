package dev.pietrorussod.integrationhub.domain.order

enum class Currency(
    val minorUnitDigits: Int,
) {
    EUR(2),
    GBP(2),
    USD(2),
    ;

    companion object {
        fun from(value: String): Currency {
            require(value == value.trim()) {
                "Currency must not have leading or trailing whitespace"
            }

            return entries.firstOrNull { it.name == value }
                ?: throw IllegalArgumentException("Unsupported currency")
        }
    }
}
