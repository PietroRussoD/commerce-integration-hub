package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.OffsetDateTime

class JooqSourceCredentialsCodeGenerationTest {
    @Test
    fun `generates source credential metadata from Flyway migrations`() {
        assertEquals("source_credentials", SOURCE_CREDENTIALS.name)
        assertEquals(String::class.java, SOURCE_CREDENTIALS.KEY_ID.dataType.type)
        assertEquals(Short::class.javaObjectType, SOURCE_CREDENTIALS.PEPPER_VERSION.dataType.type)
        assertEquals(OffsetDateTime::class.java, SOURCE_CREDENTIALS.CREATED_AT.dataType.type)
        assertFalse(SOURCE_CREDENTIALS.SECRET_MAC.dataType.nullable())
        assertTrue(SOURCE_CREDENTIALS.EXPIRES_AT.dataType.nullable())
        assertEquals("pk_source_credentials", SOURCE_CREDENTIALS.primaryKey.name)
    }
}
