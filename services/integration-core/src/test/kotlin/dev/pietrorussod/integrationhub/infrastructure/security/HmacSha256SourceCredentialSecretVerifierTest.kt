package dev.pietrorussod.integrationhub.infrastructure.security

import dev.pietrorussod.integrationhub.application.authentication.SourceCredential
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import javax.crypto.spec.SecretKeySpec

class HmacSha256SourceCredentialSecretVerifierTest {
    @Test
    fun `matches the RFC 4231 HMAC SHA-256 test vector`() {
        val pepper = SecretKeySpec(ByteArray(20) { 0x0b }, "HmacSHA256")
        val verifier = HmacSha256SourceCredentialSecretVerifier { pepper }
        val credential =
            credential(
                secretMac = "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7",
            )

        assertTrue(verifier.matches("Hi There", credential))
        assertFalse(verifier.matches("Wrong secret", credential))
    }

    @Test
    fun `fails explicitly when the required pepper version is not configured`() {
        val verifier = HmacSha256SourceCredentialSecretVerifier { null }

        assertThrows(MissingSourceCredentialPepperException::class.java) {
            verifier.matches("Hi There", credential(secretMac = "a".repeat(64)))
        }
    }

    private fun credential(secretMac: String) =
        SourceCredential(
            keyId = "credential_key_01",
            sourceSystem = SourceSystem.from("marketplace-a"),
            secretMac = secretMac,
            pepperVersion = 1,
            status = SourceCredentialStatus.ACTIVE,
            expiresAt = null,
        )
}
