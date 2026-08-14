package dev.pietrorussod.integrationhub.infrastructure.security

import dev.pietrorussod.integrationhub.application.authentication.SourceCredential
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialSecretVerifier
import java.security.MessageDigest
import java.util.HexFormat

class HmacSha256SourceCredentialSecretVerifier(
    private val pepperProvider: SourceCredentialPepperProvider,
) : SourceCredentialSecretVerifier {
    override fun matches(
        presentedSecret: String,
        credential: SourceCredential,
    ): Boolean {
        val pepper =
            pepperProvider.findByVersion(credential.pepperVersion)
                ?: throw MissingSourceCredentialPepperException(credential.pepperVersion)

        val actualMac = SourceCredentialHmac.calculate(presentedSecret, pepper)
        val expectedMac = HexFormat.of().parseHex(credential.secretMac)
        return MessageDigest.isEqual(actualMac, expectedMac)
    }
}
