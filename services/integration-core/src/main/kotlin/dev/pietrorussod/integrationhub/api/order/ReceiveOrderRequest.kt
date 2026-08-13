package dev.pietrorussod.integrationhub.api.order

import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType
import org.eclipse.microprofile.openapi.annotations.media.Schema

data class ReceiveOrderRequest(
    @field:NotBlank
    @field:Size(max = 64)
    @field:Schema(type = SchemaType.STRING, nullable = false)
    val sourceSystem: String?,
    @field:NotBlank
    @field:Size(max = 128)
    @field:Schema(type = SchemaType.STRING, nullable = false)
    val externalId: String?,
    @field:NotNull
    @field:Pattern(regexp = "EUR|GBP|USD")
    @field:Schema(type = SchemaType.STRING, nullable = false)
    val currency: String?,
    @field:NotNull
    @field:Pattern(regexp = DECIMAL_AMOUNT_PATTERN)
    @field:Schema(type = SchemaType.STRING, nullable = false)
    val declaredTotalAmount: String?,
    @field:NotNull
    @field:Size(min = 1, max = 500)
    @field:Schema(type = SchemaType.ARRAY, nullable = false)
    val items: List<@Valid ReceiveOrderItemRequest>?,
) {
    private companion object {
        const val DECIMAL_AMOUNT_PATTERN = "(?:0|[1-9][0-9]{0,16})(?:\\.[0-9]{1,2})?"
    }
}
