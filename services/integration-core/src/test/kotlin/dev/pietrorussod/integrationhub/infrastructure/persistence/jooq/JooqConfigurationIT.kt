package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.SQLDialect
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

@QuarkusTest
class JooqConfigurationIT {
    @Inject
    lateinit var dslContext: DSLContext

    @Test
    fun `configures jOOQ for PostgreSQL`() {
        assertEquals(SQLDialect.POSTGRES, dslContext.dialect())
    }
}
