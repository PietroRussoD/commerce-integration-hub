package dev.pietrorussod.integrationhub.domain.order

@JvmInline
value class ExternalOrderId private constructor(
    val value: String,
) {
    companion object {
        fun from(value: String): ExternalOrderId {
            require(value.isNotBlank()) { "External order id must not be blank" }
            require(value == value.trim()) {
                "External order id must not have leading or trailing whitespace"
            }
            require(value.length <= 128) { "External order id must be at most 128 characters" }
            return ExternalOrderId(value)
        }
    }
}
