package dev.pietrorussod.integrationhub.infrastructure.persistence

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.exception.DataAccessException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

@QuarkusTest
class SourceCredentialsMigrationIT {
    @Inject
    lateinit var dslContext: DSLContext

    private val fixedCreatedAt = OffsetDateTime.parse("2026-08-14T06:02:44.321914Z")

    @BeforeEach
    fun deleteCredentials() {
        dslContext.deleteFrom(SOURCE_CREDENTIALS).execute()
    }

    @Test
    fun `stores an active source credential without a plaintext secret`() {
        insertCredential()

        val credential = dslContext.selectFrom(SOURCE_CREDENTIALS).fetchSingle()
        assertEquals("marketplace-a", credential.sourceSystem)
        assertEquals("a".repeat(64), credential.secretMac)
        assertEquals("ACTIVE", credential.status)
        assertEquals(null, credential.revokedAt)
    }

    @Test
    fun `rejects an invalid secret mac`() {
        assertThrows(DataAccessException::class.java) {
            insertCredential(secretMac = "plaintext-secret")
        }
    }

    @Test
    fun `rejects a malformed key id`() {
        assertThrows(DataAccessException::class.java) {
            insertCredential(keyId = "short")
        }
    }

    @Test
    fun `rejects a blank source system`() {
        assertThrows(DataAccessException::class.java) {
            insertCredential(sourceSystem = "   ")
        }
    }

    @Test
    fun `rejects a non-positive pepper version`() {
        assertThrows(DataAccessException::class.java) {
            insertCredential(pepperVersion = 0)
        }
    }

    @Test
    fun `requires revoked credentials to have a revocation time`() {
        assertThrows(DataAccessException::class.java) {
            insertCredential(status = "REVOKED")
        }
    }

    @Test
    fun `rejects a revocation time for an active credential`() {
        assertThrows(DataAccessException::class.java) {
            insertCredential(
                revokedAt = fixedCreatedAt,
            )
        }
    }

    @Test
    fun `stores a revoked credential with a valid revocation time`() {
        val revokedAt = fixedCreatedAt.plusSeconds(1)

        insertCredential(
            status = "REVOKED",
            revokedAt = revokedAt,
        )

        val credential = dslContext.selectFrom(SOURCE_CREDENTIALS).fetchSingle()
        assertEquals("REVOKED", credential.status)
        assertEquals(revokedAt.toInstant(), credential.revokedAt?.toInstant())
    }

    @Test
    fun `rejects an expiry before credential creation`() {
        assertThrows(DataAccessException::class.java) {
            insertCredential(
                expiresAt = fixedCreatedAt.minusSeconds(1),
            )
        }
    }

    private fun insertCredential(
        keyId: String = "credential_key_01",
        sourceSystem: String = "marketplace-a",
        secretMac: String = "a".repeat(64),
        pepperVersion: Short = 1,
        status: String = "ACTIVE",
        createdAt: OffsetDateTime = fixedCreatedAt,
        expiresAt: OffsetDateTime? = null,
        revokedAt: OffsetDateTime? = null,
    ) {
        dslContext
            .insertInto(SOURCE_CREDENTIALS)
            .set(SOURCE_CREDENTIALS.KEY_ID, keyId)
            .set(SOURCE_CREDENTIALS.SOURCE_SYSTEM, sourceSystem)
            .set(SOURCE_CREDENTIALS.SECRET_MAC, secretMac)
            .set(SOURCE_CREDENTIALS.PEPPER_VERSION, pepperVersion)
            .set(SOURCE_CREDENTIALS.STATUS, status)
            .set(SOURCE_CREDENTIALS.CREATED_AT, createdAt)
            .set(SOURCE_CREDENTIALS.EXPIRES_AT, expiresAt)
            .set(SOURCE_CREDENTIALS.REVOKED_AT, revokedAt)
            .execute()
    }
}
