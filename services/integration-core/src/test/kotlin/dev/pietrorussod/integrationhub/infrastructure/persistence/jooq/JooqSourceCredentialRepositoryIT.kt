package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialRepository
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialStatus
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

@QuarkusTest
class JooqSourceCredentialRepositoryIT {
    private val createdAt = OffsetDateTime.parse("2026-08-14T06:02:44.321914Z")

    @Inject
    lateinit var repository: SourceCredentialRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteCredentials() {
        dslContext.deleteFrom(SOURCE_CREDENTIALS).execute()
    }

    @Test
    fun `finds an active source credential by key id`() {
        insertCredential()

        val credential = repository.findByKeyId("credential_key_01")

        requireNotNull(credential)
        assertEquals("credential_key_01", credential.keyId)
        assertEquals("marketplace-a", credential.sourceSystem.value)
        assertEquals("a".repeat(64), credential.secretMac)
        assertEquals(1.toShort(), credential.pepperVersion)
        assertEquals(SourceCredentialStatus.ACTIVE, credential.status)
        assertEquals(null, credential.expiresAt)
    }

    @Test
    fun `maps revocation status and expiry`() {
        val expiresAt = createdAt.plusSeconds(3600)
        insertCredential(
            status = "REVOKED",
            expiresAt = expiresAt,
            revokedAt = createdAt.plusSeconds(60),
        )

        val credential = repository.findByKeyId("credential_key_01")

        requireNotNull(credential)
        assertEquals(SourceCredentialStatus.REVOKED, credential.status)
        assertEquals(expiresAt.toInstant(), credential.expiresAt)
    }

    @Test
    fun `returns null for an unknown key id`() {
        assertEquals(null, repository.findByKeyId("unknown_key_id_01"))
    }

    private fun insertCredential(
        status: String = "ACTIVE",
        expiresAt: OffsetDateTime? = null,
        revokedAt: OffsetDateTime? = null,
    ) {
        dslContext
            .insertInto(SOURCE_CREDENTIALS)
            .set(SOURCE_CREDENTIALS.KEY_ID, "credential_key_01")
            .set(SOURCE_CREDENTIALS.SOURCE_SYSTEM, "marketplace-a")
            .set(SOURCE_CREDENTIALS.SECRET_MAC, "a".repeat(64))
            .set(SOURCE_CREDENTIALS.PEPPER_VERSION, 1)
            .set(SOURCE_CREDENTIALS.STATUS, status)
            .set(SOURCE_CREDENTIALS.CREATED_AT, createdAt)
            .set(SOURCE_CREDENTIALS.EXPIRES_AT, expiresAt)
            .set(SOURCE_CREDENTIALS.REVOKED_AT, revokedAt)
            .execute()
    }
}
