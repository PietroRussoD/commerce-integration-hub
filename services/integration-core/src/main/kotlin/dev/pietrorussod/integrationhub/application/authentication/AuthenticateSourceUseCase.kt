package dev.pietrorussod.integrationhub.application.authentication

import java.time.Clock

class AuthenticateSourceUseCase(
    private val credentialRepository: SourceCredentialRepository,
    private val secretVerifier: SourceCredentialSecretVerifier,
    private val clock: Clock,
) {
    fun authenticate(presentedApiKey: String?): SourceAuthenticationResult {
        val parsedApiKey = PresentedSourceApiKey.parse(presentedApiKey) ?: return SourceAuthenticationResult.Rejected
        val credential =
            credentialRepository.findByKeyId(parsedApiKey.keyId)
                ?: return SourceAuthenticationResult.Rejected

        val secretMatches = secretVerifier.matches(parsedApiKey.secret, credential)
        if (!secretMatches || !credential.isUsableAt(clock.instant())) {
            return SourceAuthenticationResult.Rejected
        }

        return SourceAuthenticationResult.Authenticated(credential.sourceSystem)
    }

    private class PresentedSourceApiKey private constructor(
        val keyId: String,
        val secret: String,
    ) {
        override fun toString(): String = "PresentedSourceApiKey(keyId=$keyId, secret=[REDACTED])"

        companion object {
            private val KEY_ID_PATTERN = Regex("[A-Za-z0-9_-]{16,40}")
            private val SECRET_PATTERN = Regex("[A-Za-z0-9_-]{43}")

            fun parse(value: String?): PresentedSourceApiKey? {
                if (value == null || value != value.trim()) {
                    return null
                }

                val separatorIndex = value.indexOf('.')
                if (separatorIndex <= 0 || separatorIndex != value.lastIndexOf('.')) {
                    return null
                }

                val keyId = value.substring(0, separatorIndex)
                val secret = value.substring(separatorIndex + 1)
                if (!keyId.matches(KEY_ID_PATTERN) || !secret.matches(SECRET_PATTERN)) {
                    return null
                }

                return PresentedSourceApiKey(keyId, secret)
            }
        }
    }
}
