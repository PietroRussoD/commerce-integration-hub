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
import java.sql.Types
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class OrderItemsMigrationTest {
    @Inject
    lateinit var dataSource: AgroalDataSource

    @Test
    fun `rejects duplicate positions within the same order`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            val orderId = insertOrder(connection)
            insertItem(connection, orderId, position = 0, externalLineId = "line-1")

            val exception =
                assertThrows(SQLException::class.java) {
                    insertItem(connection, orderId, position = 0, externalLineId = "line-2")
                }

            assertEquals(UNIQUE_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    @Test
    fun `rejects duplicate external line ids within the same order`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            val orderId = insertOrder(connection)
            insertItem(connection, orderId, position = 0, externalLineId = "line-1")

            val exception =
                assertThrows(SQLException::class.java) {
                    insertItem(connection, orderId, position = 1, externalLineId = "line-1")
                }

            assertEquals(UNIQUE_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    @Test
    fun `allows missing external line ids`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            val orderId = insertOrder(connection)

            insertItem(connection, orderId, position = 0, externalLineId = null)
            insertItem(connection, orderId, position = 1, externalLineId = null)

            assertEquals(2, countItems(connection, orderId))
            connection.rollback()
        }
    }

    @Test
    fun `rejects a non-positive quantity`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            val orderId = insertOrder(connection)

            val exception =
                assertThrows(SQLException::class.java) {
                    insertItem(
                        connection,
                        orderId,
                        position = 0,
                        externalLineId = "line-1",
                        quantity = BigDecimal.ZERO,
                    )
                }

            assertEquals(CHECK_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    @Test
    fun `rejects an item for an unknown order`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false

            val exception =
                assertThrows(SQLException::class.java) {
                    insertItem(
                        connection,
                        UUID.randomUUID(),
                        position = 0,
                        externalLineId = "line-1",
                    )
                }

            assertEquals(FOREIGN_KEY_VIOLATION, exception.sqlState)
            connection.rollback()
        }
    }

    @Test
    fun `deletes order items when their order is deleted`() {
        dataSource.connection.use { connection ->
            connection.autoCommit = false
            val orderId = insertOrder(connection)
            insertItem(connection, orderId, position = 0, externalLineId = "line-1")

            connection.prepareStatement("DELETE FROM orders WHERE id = ?").use { statement ->
                statement.setObject(1, orderId)
                statement.executeUpdate()
            }

            assertEquals(0, countItems(connection, orderId))
            connection.rollback()
        }
    }

    private fun insertOrder(connection: Connection): UUID {
        val orderId = UUID.randomUUID()
        connection
            .prepareStatement(
                """
                INSERT INTO orders (
                    id, source_system, external_order_id, status, currency, total_amount,
                    payload_fingerprint, payload_fingerprint_version, received_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, orderId)
                statement.setString(2, "migration-test-${UUID.randomUUID()}")
                statement.setString(3, "external-${UUID.randomUUID()}")
                statement.setString(4, "RECEIVED")
                statement.setString(5, "EUR")
                statement.setBigDecimal(6, BigDecimal.ZERO)
                statement.setString(7, "a".repeat(64))
                statement.setShort(8, 1)
                statement.setObject(9, OffsetDateTime.now(ZoneOffset.UTC))
                statement.executeUpdate()
            }
        return orderId
    }

    private fun insertItem(
        connection: Connection,
        orderId: UUID,
        position: Int,
        externalLineId: String?,
        quantity: BigDecimal = BigDecimal.ONE,
    ) {
        connection
            .prepareStatement(
                """
                INSERT INTO order_items (
                    id, order_id, external_line_id, sku, description,
                    quantity, unit_price, line_amount, position
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """.trimIndent(),
            ).use { statement ->
                statement.setObject(1, UUID.randomUUID())
                statement.setObject(2, orderId)
                if (externalLineId == null) {
                    statement.setNull(3, Types.VARCHAR)
                } else {
                    statement.setString(3, externalLineId)
                }
                statement.setString(4, "SKU-BOOK-1")
                statement.setString(5, "First item")
                statement.setBigDecimal(6, quantity)
                statement.setBigDecimal(7, BigDecimal("19.99"))
                statement.setBigDecimal(8, BigDecimal("19.99"))
                statement.setInt(9, position)
                statement.executeUpdate()
            }
    }

    private fun countItems(
        connection: Connection,
        orderId: UUID,
    ): Int =
        connection.prepareStatement("SELECT COUNT(*) FROM order_items WHERE order_id = ?").use { statement ->
            statement.setObject(1, orderId)
            statement.executeQuery().use { resultSet ->
                resultSet.next()
                resultSet.getInt(1)
            }
        }

    private companion object {
        const val UNIQUE_VIOLATION = "23505"
        const val FOREIGN_KEY_VIOLATION = "23503"
        const val CHECK_VIOLATION = "23514"
    }
}
