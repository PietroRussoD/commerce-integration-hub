package dev.pietrorussod.integrationhub.api.order

import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.NotNull
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType
import org.eclipse.microprofile.openapi.annotations.media.Schema

data class ReceiveOrderItemRequest(
    @field:Size(min = 1, max = 150)
    val externalLineId: String? = null,
    @field:NotBlank
    @field:Size(max = 100)
    @field:Schema(type = SchemaType.STRING, nullable = false)
    val sku: String?,
    @field:Size(max = 500)
    val description: String? = null,
    @field:NotNull
    @field:Pattern(regexp = DECIMAL_VALUE_PATTERN)
    @field:Schema(type = SchemaType.STRING, nullable = false)
    val quantity: String?,
    @field:NotNull
    @field:Pattern(regexp = DECIMAL_VALUE_PATTERN)
    @field:Schema(type = SchemaType.STRING, nullable = false)
    val unitPrice: String?,
) {
    private companion object {
        const val DECIMAL_VALUE_PATTERN = "(?:0|[1-9][0-9]{0,14})(?:\\.[0-9]{1,4})?"
    }
}
