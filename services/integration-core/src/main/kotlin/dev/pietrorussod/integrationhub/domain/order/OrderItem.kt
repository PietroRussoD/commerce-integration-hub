package dev.pietrorussod.integrationhub.domain.order

import java.math.BigDecimal
import java.math.RoundingMode
import java.util.UUID

@ConsistentCopyVisibility
data class OrderItem private constructor(
    val id: UUID,
    val externalLineId: String?,
    val sku: String,
    val description: String?,
    val quantity: BigDecimal,
    val unitPrice: Money,
    val lineAmount: Money,
    val position: Int,
) {
    companion object {
        private const val MAX_EXTERNAL_LINE_ID_LENGTH = 150
        private const val MAX_SKU_LENGTH = 100
        private const val MAX_DESCRIPTION_LENGTH = 500
        private const val MAX_DECIMAL_PRECISION = 19
        private const val MAX_INPUT_SCALE = 4
        private const val MAX_INPUT_INTEGER_DIGITS = MAX_DECIMAL_PRECISION - MAX_INPUT_SCALE
        private const val MAX_LINE_AMOUNT_SCALE = 2
        private const val MAX_LINE_AMOUNT_INTEGER_DIGITS = MAX_DECIMAL_PRECISION - MAX_LINE_AMOUNT_SCALE

        fun create(
            id: UUID,
            externalLineId: String?,
            sku: String,
            description: String?,
            quantity: BigDecimal,
            unitPrice: Money,
            position: Int,
        ): OrderItem {
            validateOptionalIdentifier(externalLineId)
            require(sku.isNotBlank()) { "SKU must not be blank" }
            require(sku == sku.trim()) { "SKU must not have leading or trailing whitespace" }
            require(sku.length <= MAX_SKU_LENGTH) { "SKU must be at most $MAX_SKU_LENGTH characters" }
            require(description == null || description.length <= MAX_DESCRIPTION_LENGTH) {
                "Description must be at most $MAX_DESCRIPTION_LENGTH characters"
            }
            requireDecimal(quantity, "Quantity")
            require(quantity > BigDecimal.ZERO) { "Quantity must be greater than zero" }
            requireDecimal(unitPrice.amount, "Unit price")
            require(unitPrice.amount >= BigDecimal.ZERO) { "Unit price must not be negative" }
            require(position >= 0) { "Position must not be negative" }

            val normalizedQuantity = quantity.stripTrailingZeros()
            val roundedLineAmount =
                normalizedQuantity
                    .multiply(unitPrice.amount)
                    .setScale(unitPrice.currency.minorUnitDigits, RoundingMode.HALF_UP)
            require(integerDigits(roundedLineAmount) <= MAX_LINE_AMOUNT_INTEGER_DIGITS) {
                "Line amount exceeds the supported precision"
            }
            val lineAmount = Money.of(roundedLineAmount, unitPrice.currency)

            return OrderItem(
                id = id,
                externalLineId = externalLineId,
                sku = sku,
                description = description,
                quantity = normalizedQuantity,
                unitPrice = unitPrice,
                lineAmount = lineAmount,
                position = position,
            )
        }

        private fun validateOptionalIdentifier(externalLineId: String?) {
            if (externalLineId == null) {
                return
            }

            require(externalLineId.isNotBlank()) { "External line id must not be blank" }
            require(externalLineId == externalLineId.trim()) {
                "External line id must not have leading or trailing whitespace"
            }
            require(externalLineId.length <= MAX_EXTERNAL_LINE_ID_LENGTH) {
                "External line id must be at most $MAX_EXTERNAL_LINE_ID_LENGTH characters"
            }
        }

        private fun requireDecimal(
            value: BigDecimal,
            fieldName: String,
        ) {
            val normalized = value.stripTrailingZeros()
            val fractionalDigits = normalized.scale().coerceAtLeast(0)

            require(fractionalDigits <= MAX_INPUT_SCALE) {
                "$fieldName must have at most $MAX_INPUT_SCALE fractional digits"
            }
            require(integerDigits(normalized) <= MAX_INPUT_INTEGER_DIGITS) {
                "$fieldName exceeds the supported integer digits"
            }
            require(normalized.precision() <= MAX_DECIMAL_PRECISION) {
                "$fieldName exceeds the supported precision"
            }
        }

        private fun integerDigits(value: BigDecimal): Int {
            val normalized = value.stripTrailingZeros()
            return (normalized.precision() - normalized.scale()).coerceAtLeast(0)
        }
    }
}
