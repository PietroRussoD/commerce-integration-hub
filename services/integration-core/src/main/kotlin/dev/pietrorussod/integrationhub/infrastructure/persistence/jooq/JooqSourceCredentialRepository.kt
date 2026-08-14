package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.authentication.SourceCredential
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialRepository
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.records.SourceCredentialsRecord
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.jooq.DSLContext

@ApplicationScoped
class JooqSourceCredentialRepository
    @Inject
    constructor(
        private val dslContext: DSLContext,
    ) : SourceCredentialRepository {
        override fun findByKeyId(keyId: String): SourceCredential? =
            dslContext
                .selectFrom(SOURCE_CREDENTIALS)
                .where(SOURCE_CREDENTIALS.KEY_ID.eq(keyId))
                .fetchOne()
                ?.toApplicationModel()

        private fun SourceCredentialsRecord.toApplicationModel(): SourceCredential =
            SourceCredential(
                keyId = requireNotNull(keyId),
                sourceSystem = SourceSystem.from(requireNotNull(sourceSystem)),
                secretMac = requireNotNull(secretMac),
                pepperVersion = requireNotNull(pepperVersion),
                status = SourceCredentialStatus.valueOf(requireNotNull(status)),
                expiresAt = expiresAt?.toInstant(),
            )
    }
