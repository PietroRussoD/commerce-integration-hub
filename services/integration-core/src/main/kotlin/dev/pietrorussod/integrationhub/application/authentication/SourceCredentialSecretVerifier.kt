package dev.pietrorussod.integrationhub.application.authentication

interface SourceCredentialSecretVerifier {
    fun matches(
        presentedSecret: String,
        credential: SourceCredential,
    ): Boolean
}
