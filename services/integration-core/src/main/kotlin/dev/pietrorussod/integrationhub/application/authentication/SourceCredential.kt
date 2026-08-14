package dev.pietrorussod.integrationhub.application.authentication

import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import java.time.Instant

data class SourceCredential(
    val keyId: String,
    val sourceSystem: SourceSystem,
    val secretMac: String,
    val pepperVersion: Short,
    val status: SourceCredentialStatus,
    val expiresAt: Instant?,
) {
    init {
        require(keyId.matches(KEY_ID_PATTERN)) { "Credential key ID has an invalid format" }
        require(secretMac.matches(SHA_256_PATTERN)) {
            "Credential secret MAC must be a lowercase SHA-256 hash"
        }
        require(pepperVersion > 0) { "Credential pepper version must be positive" }
    }

    fun isUsableAt(instant: Instant): Boolean =
        status == SourceCredentialStatus.ACTIVE && (expiresAt == null || instant.isBefore(expiresAt))

    private companion object {
        val KEY_ID_PATTERN = Regex("[A-Za-z0-9_-]{16,40}")
        val SHA_256_PATTERN = Regex("[0-9a-f]{64}")
    }
}
