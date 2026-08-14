package dev.pietrorussod.integrationhub.infrastructure.provisioning

import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import dev.pietrorussod.integrationhub.infrastructure.security.MissingSourceCredentialPepperException
import dev.pietrorussod.integrationhub.infrastructure.security.SourceCredentialHmac
import dev.pietrorussod.integrationhub.infrastructure.security.SourceCredentialPepperProvider
import org.jooq.DSLContext
import java.security.SecureRandom
import java.time.Clock
import java.time.ZoneOffset
import java.util.Base64
import java.util.HexFormat

class SourceCredentialProvisioner(
    private val dslContext: DSLContext,
    private val pepperProvider: SourceCredentialPepperProvider,
    private val clock: Clock = Clock.systemUTC(),
    private val secureRandom: SecureRandom = SecureRandom(),
) {
    fun provision(
        sourceSystemValue: String,
        pepperVersion: Short,
    ): ProvisionedSourceCredential {
        val sourceSystem = SourceSystem.from(sourceSystemValue)
        require(pepperVersion > 0) { "Pepper version must be positive" }
        val pepper =
            pepperProvider.findByVersion(pepperVersion)
                ?: throw MissingSourceCredentialPepperException(pepperVersion)

        val credential =
            ProvisionedSourceCredential(
                keyId = "$KEY_ID_PREFIX${randomBase64Url(KEY_ID_RANDOM_BYTES)}",
                secret = randomBase64Url(SECRET_BYTES),
            )
        val secretMac = HexFormat.of().formatHex(SourceCredentialHmac.calculate(credential.secret, pepper))

        dslContext
            .insertInto(SOURCE_CREDENTIALS)
            .set(SOURCE_CREDENTIALS.KEY_ID, credential.keyId)
            .set(SOURCE_CREDENTIALS.SOURCE_SYSTEM, sourceSystem.value)
            .set(SOURCE_CREDENTIALS.SECRET_MAC, secretMac)
            .set(SOURCE_CREDENTIALS.PEPPER_VERSION, pepperVersion)
            .set(SOURCE_CREDENTIALS.STATUS, SourceCredentialStatus.ACTIVE.name)
            .set(SOURCE_CREDENTIALS.CREATED_AT, clock.instant().atOffset(ZoneOffset.UTC))
            .execute()

        return credential
    }

    fun revoke(keyId: String): Boolean {
        require(keyId.matches(KEY_ID_PATTERN)) { "Credential key ID has an invalid format" }

        return dslContext
            .update(SOURCE_CREDENTIALS)
            .set(SOURCE_CREDENTIALS.STATUS, SourceCredentialStatus.REVOKED.name)
            .set(SOURCE_CREDENTIALS.REVOKED_AT, clock.instant().atOffset(ZoneOffset.UTC))
            .where(SOURCE_CREDENTIALS.KEY_ID.eq(keyId))
            .and(SOURCE_CREDENTIALS.STATUS.eq(SourceCredentialStatus.ACTIVE.name))
            .execute() == 1
    }

    private fun randomBase64Url(byteCount: Int): String {
        val bytes = ByteArray(byteCount)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private companion object {
        const val KEY_ID_PREFIX = "src_"
        const val KEY_ID_RANDOM_BYTES = 18
        const val SECRET_BYTES = 32
        val KEY_ID_PATTERN = Regex("[A-Za-z0-9_-]{16,40}")
    }
}
