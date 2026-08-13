package dev.pietrorussod.integrationhub.api.order

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size

data class ReceiveOrderRequest(
    @field:NotBlank
    @field:Size(max = 64)
    val sourceSystem: String,
    @field:NotBlank
    @field:Size(max = 128)
    val externalId: String,
    @field:Pattern(regexp = "EUR|GBP|USD")
    val currency: String,
    @field:Pattern(regexp = DECIMAL_AMOUNT_PATTERN)
    val declaredTotalAmount: String,
    @field:Size(min = 1, max = 500)
    val items: List<@Valid ReceiveOrderItemRequest>,
) {
    private companion object {
        const val DECIMAL_AMOUNT_PATTERN = "(?:0|[1-9][0-9]{0,16})(?:\\.[0-9]{1,2})?"
    }
}
