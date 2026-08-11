package dev.pietrorussod.integrationhub.domain.order

@JvmInline
value class SourceSystem private constructor(
    val value: String,
) {
    companion object {
        fun from(value: String): SourceSystem {
            require(value.isNotBlank()) { "Source system must not be blank" }
            require(value == value.trim()) {
                "Source system must not have leading or trailing whitespace"
            }
            require(value.length <= 64) { "Source system must be at most 64 characters" }
            return SourceSystem(value)
        }
    }
}
