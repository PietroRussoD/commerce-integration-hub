package dev.pietrorussod.integrationhub.infrastructure.security

import dev.pietrorussod.integrationhub.application.authentication.SourceCredential
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialSecretVerifier
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.util.HexFormat
import javax.crypto.Mac

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
        val mac = Mac.getInstance(ALGORITHM)
        mac.init(pepper)

        val actualMac = mac.doFinal(presentedSecret.toByteArray(StandardCharsets.UTF_8))
        val expectedMac = HexFormat.of().parseHex(credential.secretMac)
        return MessageDigest.isEqual(actualMac, expectedMac)
    }

    private companion object {
        const val ALGORITHM = "HmacSHA256"
    }
}
