package dev.pietrorussod.integrationhub.domain.order

@JvmInline
value class SourceSystem private constructor(
    val value: String,
) {
    companion object {
        fun from(value: String): SourceSystem {
            val normalized = value.trim()
            require(normalized.isNotEmpty()) { "Source system must not be blank" }
            require(normalized.length <= 64) { "Source system must be at most 64 characters" }
            return SourceSystem(normalized)
        }
    }
}
