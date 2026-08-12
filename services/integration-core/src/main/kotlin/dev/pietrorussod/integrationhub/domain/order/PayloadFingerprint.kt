package dev.pietrorussod.integrationhub.domain.order

data class PayloadFingerprint(
    val value: String,
    val canonicalizationVersion: Short,
) {
    init {
        require(value.matches(SHA_256_PATTERN)) { "Payload fingerprint must be a lowercase SHA-256 hash" }
        require(canonicalizationVersion > 0) { "Canonicalization version must be positive" }
    }

    private companion object {
        val SHA_256_PATTERN = Regex("[0-9a-f]{64}")
    }
}
