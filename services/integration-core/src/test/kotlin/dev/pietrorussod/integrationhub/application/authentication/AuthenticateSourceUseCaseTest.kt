package dev.pietrorussod.integrationhub.application.authentication

import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class AuthenticateSourceUseCaseTest {
    private val now = Instant.parse("2026-08-14T08:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    @Test
    fun `authenticates an active unexpired credential with the correct secret`() {
        val verifier = RecordingSecretVerifier(matches = true)
        val credential = credential(expiresAt = now.plusSeconds(60))
        val useCase = useCase(credential, verifier)

        val result = useCase.authenticate("credential_key_01.${"s".repeat(43)}")

        assertEquals(
            SourceAuthenticationResult.Authenticated(SourceSystem.from("marketplace-a")),
            result,
        )
        assertEquals("s".repeat(43), verifier.presentedSecret)
        assertEquals(credential, verifier.credential)
    }

    @Test
    fun `rejects a credential when its secret does not match`() {
        val useCase = useCase(credential(), RecordingSecretVerifier(matches = false))

        val result = useCase.authenticate("credential_key_01.${"s".repeat(43)}")

        assertEquals(SourceAuthenticationResult.Rejected, result)
    }

    @Test
    fun `rejects a revoked credential after verifying its secret`() {
        val verifier = RecordingSecretVerifier(matches = true)
        val useCase =
            useCase(
                credential(status = SourceCredentialStatus.REVOKED),
                verifier,
            )

        val result = useCase.authenticate("credential_key_01.${"s".repeat(43)}")

        assertEquals(SourceAuthenticationResult.Rejected, result)
        assertTrue(verifier.wasCalled)
    }

    @Test
    fun `rejects a credential at its expiry instant`() {
        val useCase =
            useCase(
                credential(expiresAt = now),
                RecordingSecretVerifier(matches = true),
            )

        val result = useCase.authenticate("credential_key_01.${"s".repeat(43)}")

        assertEquals(SourceAuthenticationResult.Rejected, result)
    }

    @Test
    fun `rejects an unknown key without verifying a secret`() {
        val verifier = RecordingSecretVerifier(matches = true)
        val useCase = useCase(credential = null, verifier)

        val result = useCase.authenticate("credential_key_01.${"s".repeat(43)}")

        assertEquals(SourceAuthenticationResult.Rejected, result)
        assertFalse(verifier.wasCalled)
    }

    @Test
    fun `rejects malformed API keys before accessing the repository`() {
        val repository = RecordingCredentialRepository(credential())
        val useCase = AuthenticateSourceUseCase(repository, RecordingSecretVerifier(true), clock)
        val malformedApiKeys =
            listOf(
                null,
                "",
                " credential_key_01.${"s".repeat(43)}",
                "short.${"s".repeat(43)}",
                "credential_key_01.short",
                "credential_key_01.${"s".repeat(42)}",
                "credential_key_01.${"s".repeat(44)}",
                "credential_key_01.${"s".repeat(43)}.extra",
            )

        malformedApiKeys.forEach { apiKey ->
            assertEquals(SourceAuthenticationResult.Rejected, useCase.authenticate(apiKey))
        }
        assertFalse(repository.wasCalled)
    }

    private fun useCase(
        credential: SourceCredential?,
        verifier: RecordingSecretVerifier,
    ): AuthenticateSourceUseCase =
        AuthenticateSourceUseCase(
            credentialRepository = RecordingCredentialRepository(credential),
            secretVerifier = verifier,
            clock = clock,
        )

    private fun credential(
        status: SourceCredentialStatus = SourceCredentialStatus.ACTIVE,
        expiresAt: Instant? = null,
    ) = SourceCredential(
        keyId = "credential_key_01",
        sourceSystem = SourceSystem.from("marketplace-a"),
        secretMac = "a".repeat(64),
        pepperVersion = 1,
        status = status,
        expiresAt = expiresAt,
    )

    private class RecordingCredentialRepository(
        private val credential: SourceCredential?,
    ) : SourceCredentialRepository {
        var wasCalled = false
            private set

        override fun findByKeyId(keyId: String): SourceCredential? {
            wasCalled = true
            return credential?.takeIf { it.keyId == keyId }
        }
    }

    private class RecordingSecretVerifier(
        private val matches: Boolean,
    ) : SourceCredentialSecretVerifier {
        var wasCalled = false
            private set
        var presentedSecret: String? = null
            private set
        var credential: SourceCredential? = null
            private set

        override fun matches(
            presentedSecret: String,
            credential: SourceCredential,
        ): Boolean {
            wasCalled = true
            this.presentedSecret = presentedSecret
            this.credential = credential
            return matches
        }
    }
}
