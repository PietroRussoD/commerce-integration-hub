package dev.pietrorussod.integrationhub.api.order

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

data class ReceiveOrderItemRequest(
    @field:Size(min = 1, max = 150)
    val externalLineId: String? = null,
    @field:NotBlank
    @field:Size(max = 100)
    val sku: String,
    @field:Size(max = 500)
    val description: String? = null,
    @field:Pattern(regexp = DECIMAL_VALUE_PATTERN)
    val quantity: String,
    @field:Pattern(regexp = DECIMAL_VALUE_PATTERN)
    val unitPrice: String,
) {
    private companion object {
        const val DECIMAL_VALUE_PATTERN = "(?:0|[1-9][0-9]{0,14})(?:\\.[0-9]{1,4})?"
    }
}
