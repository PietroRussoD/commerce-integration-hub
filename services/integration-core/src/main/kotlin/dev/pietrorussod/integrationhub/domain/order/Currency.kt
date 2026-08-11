package dev.pietrorussod.integrationhub.domain.order

enum class Currency(
    val minorUnitDigits: Int,
) {
    EUR(2),
    GBP(2),
    USD(2),
}
