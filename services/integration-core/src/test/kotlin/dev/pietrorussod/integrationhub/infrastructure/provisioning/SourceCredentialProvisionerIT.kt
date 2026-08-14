package dev.pietrorussod.integrationhub.infrastructure.provisioning

import dev.pietrorussod.integrationhub.application.authentication.AuthenticateSourceUseCase
import dev.pietrorussod.integrationhub.application.authentication.SourceAuthenticationResult
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialRepository
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import dev.pietrorussod.integrationhub.infrastructure.security.HmacSha256SourceCredentialSecretVerifier
import dev.pietrorussod.integrationhub.infrastructure.security.MissingSourceCredentialPepperException
import dev.pietrorussod.integrationhub.infrastructure.security.SourceCredentialPepperProvider
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@QuarkusTest
class SourceCredentialProvisionerIT {
    @Inject
    lateinit var dslContext: DSLContext

    @Inject
    lateinit var credentialRepository: SourceCredentialRepository

    @Inject
    lateinit var pepperProvider: SourceCredentialPepperProvider

    private val now = Instant.parse("2026-08-14T12:00:00Z")
    private val clock = Clock.fixed(now, ZoneOffset.UTC)

    @BeforeEach
    fun prepareDatabase() {
        dslContext.deleteFrom(SOURCE_CREDENTIALS).execute()
    }

    @Test
    fun `provisions an authenticatable credential without storing its secret`() {
        val credential = provisioner().provision("MARKETPLACE_A", 1)

        assertTrue(credential.keyId.matches(Regex("src_[A-Za-z0-9_-]{24}")))
        assertTrue(credential.secret.matches(Regex("[A-Za-z0-9_-]{43}")))
        assertEquals(
            SourceAuthenticationResult.Authenticated(SourceSystem.from("MARKETPLACE_A")),
            authenticator().authenticate(credential.apiKey),
        )

        val stored = dslContext.selectFrom(SOURCE_CREDENTIALS).fetchSingle()
        assertEquals(credential.keyId, stored.keyId)
        assertEquals("MARKETPLACE_A", stored.sourceSystem)
        val storedSecretMac = requireNotNull(stored.secretMac)
        assertEquals(64, storedSecretMac.length)
        assertFalse(storedSecretMac.contains(credential.secret))
        assertEquals("ProvisionedSourceCredential(keyId=${credential.keyId}, secret=[REDACTED])", credential.toString())
    }

    @Test
    fun `revokes an active credential`() {
        val credential = provisioner().provision("MARKETPLACE_A", 1)

        assertTrue(provisioner().revoke(credential.keyId))
        assertFalse(provisioner().revoke(credential.keyId))
        assertEquals(SourceAuthenticationResult.Rejected, authenticator().authenticate(credential.apiKey))

        val stored = dslContext.selectFrom(SOURCE_CREDENTIALS).fetchSingle()
        assertEquals("REVOKED", stored.status)
        assertEquals(now, requireNotNull(stored.revokedAt).toInstant())
    }

    @Test
    fun `does not persist a credential when its pepper version is unavailable`() {
        val provisioner = SourceCredentialProvisioner(dslContext, SourceCredentialPepperProvider { null }, clock)

        assertThrows(MissingSourceCredentialPepperException::class.java) {
            provisioner.provision("MARKETPLACE_A", 2)
        }
        assertEquals(0, dslContext.fetchCount(SOURCE_CREDENTIALS))
    }

    private fun provisioner() = SourceCredentialProvisioner(dslContext, pepperProvider, clock)

    private fun authenticator() =
        AuthenticateSourceUseCase(
            credentialRepository = credentialRepository,
            secretVerifier = HmacSha256SourceCredentialSecretVerifier(pepperProvider),
            clock = clock,
        )
}
