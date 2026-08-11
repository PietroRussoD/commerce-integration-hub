package dev.pietrorussod.integrationhub.infrastructure.persistence

import io.agroal.api.AgroalDataSource
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.sql.Connection
import java.sql.SQLException
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class DatabaseMigrationTest {
    @Inject
    lateinit var dataSource: AgroalDataSource

    @Test
    fun `creates orders table with source identity uniqueness`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false

            val sourceSystem = "migration-test-${UUID.randomUUID()}"
            val externalOrderId = "external-${UUID.randomUUID()}"
            insertOrder(connection, UUID.randomUUID(), sourceSystem, externalOrderId, "RECEIVED")

            val exception =
                assertThrows(SQLException::class.java) {
                    insertOrder(connection, UUID.randomUUID(), sourceSystem, externalOrderId, "RECEIVED")
                }

            assertEquals(UNIQUE_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    @Test
    fun `rejects an unknown order status`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false

            val exception =
                assertThrows(SQLException::class.java) {
                    insertOrder(
                        connection,
                        UUID.randomUUID(),
                        "migration-test-${UUID.randomUUID()}",
                        "external-${UUID.randomUUID()}",
                        "UNKNOWN",
                    )
                }

            assertEquals(CHECK_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    @Test
    fun `rejects an unsupported currency`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false

            val exception =
                assertThrows(SQLException::class.java) {
                    insertOrder(
                        connection,
                        UUID.randomUUID(),
                        "migration-test-${UUID.randomUUID()}",
                        "external-${UUID.randomUUID()}",
                        "RECEIVED",
                        "CHF",
                    )
                }

            assertEquals(CHECK_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    @Test
    fun `rejects a negative order total`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false

            val exception =
                assertThrows(SQLException::class.java) {
                    insertOrder(
                        connection,
                        UUID.randomUUID(),
                        "migration-test-${UUID.randomUUID()}",
                        "external-${UUID.randomUUID()}",
                        "RECEIVED",
                        totalAmount = BigDecimal("-0.01"),
                    )
                }

            assertEquals(CHECK_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    private fun insertOrder(
        connection: Connection,
        id: UUID,
        sourceSystem: String,
        externalOrderId: String,
        status: String,
        currency: String = "EUR",
        totalAmount: BigDecimal = BigDecimal.ZERO,
    ) {
        connection
            .prepareStatement(
                """
                INSERT INTO orders (id, source_system, external_order_id, status, currency, total_amount, received_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, id)
                statement.setString(2, sourceSystem)
                statement.setString(3, externalOrderId)
                statement.setString(4, status)
                statement.setString(5, currency)
                statement.setBigDecimal(6, totalAmount)
                statement.setObject(7, OffsetDateTime.now(ZoneOffset.UTC))
                statement.executeUpdate()
            }
    }

    private companion object {
        const val UNIQUE_VIOLATION = "23505"
        const val CHECK_VIOLATION = "23514"
    }
}
