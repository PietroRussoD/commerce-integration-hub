package dev.pietrorussod.integrationhub.domain.order

@JvmInline
value class ExternalOrderId private constructor(
    val value: String,
) {
    companion object {
        fun from(value: String): ExternalOrderId {
            val normalized = value.trim()
            require(normalized.isNotEmpty()) { "External order id must not be blank" }
            require(normalized.length <= 128) { "External order id must be at most 128 characters" }
            return ExternalOrderId(normalized)
        }
    }
}
