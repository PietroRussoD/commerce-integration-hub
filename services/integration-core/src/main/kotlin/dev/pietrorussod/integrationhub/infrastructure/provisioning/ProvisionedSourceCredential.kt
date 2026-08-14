package dev.pietrorussod.integrationhub.infrastructure.provisioning

data class ProvisionedSourceCredential(
    val keyId: String,
    val secret: String,
) {
    val apiKey: String
        get() = "$keyId.$secret"

    override fun toString(): String = "ProvisionedSourceCredential(keyId=$keyId, secret=[REDACTED])"
}
