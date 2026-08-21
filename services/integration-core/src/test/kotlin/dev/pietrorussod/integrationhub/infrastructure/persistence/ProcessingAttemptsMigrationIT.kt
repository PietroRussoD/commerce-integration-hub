package dev.pietrorussod.integrationhub.infrastructure.persistence

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.jooq.exception.DataAccessException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.OffsetDateTime
import java.util.UUID

@QuarkusTest
class ProcessingAttemptsMigrationIT {
    @Inject
    lateinit var dslContext: DSLContext

    private val startedAt = OffsetDateTime.parse("2026-08-21T08:00:00Z")

    @BeforeEach
    fun deleteData() {
        dslContext.deleteFrom(PROCESSING_ATTEMPTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `stores an initial started attempt`() {
        val orderId = insertOrder()

        insertAttempt(orderId = orderId)

        val attempt = dslContext.selectFrom(PROCESSING_ATTEMPTS).fetchSingle()
        assertEquals(orderId, attempt.orderId)
        assertEquals(1, attempt.attemptNumber)
        assertEquals("STARTED", attempt.status)
        assertEquals("INITIAL", attempt.triggerType)
        assertEquals(null, attempt.completedAt)
    }

    @Test
    fun `stores successful and failed completed attempts`() {
        val successfulOrderId = insertOrder()
        val failedOrderId = insertOrder()

        insertAttempt(
            orderId = successfulOrderId,
            status = "SUCCEEDED",
            completedAt = startedAt.plusSeconds(1),
        )
        insertAttempt(
            orderId = failedOrderId,
            status = "FAILED",
            errorCode = "DEPENDENCY_TIMEOUT",
            errorMessage = "The downstream dependency timed out",
            completedAt = startedAt.plusSeconds(2),
        )

        assertEquals(2, dslContext.fetchCount(PROCESSING_ATTEMPTS))
    }

    @Test
    fun `rejects duplicate attempt numbers for one order`() {
        val orderId = insertOrder()
        insertAttempt(orderId = orderId, status = "SUCCEEDED", completedAt = startedAt.plusSeconds(1))

        assertThrows(DataAccessException::class.java) {
            insertAttempt(
                orderId = orderId,
                status = "SUCCEEDED",
                completedAt = startedAt.plusSeconds(2),
            )
        }
    }

    @Test
    fun `rejects two active attempts for one order`() {
        val orderId = insertOrder()
        insertAttempt(orderId = orderId)

        assertThrows(DataAccessException::class.java) {
            insertAttempt(orderId = orderId, attemptNumber = 2)
        }
    }

    @Test
    fun `allows a new active attempt after a completed attempt`() {
        val orderId = insertOrder()
        insertAttempt(
            orderId = orderId,
            status = "FAILED",
            errorCode = "DEPENDENCY_TIMEOUT",
            errorMessage = "The downstream dependency timed out",
            completedAt = startedAt.plusSeconds(1),
        )

        insertAttempt(orderId = orderId, attemptNumber = 2, triggerType = "AUTOMATIC_RETRY")

        assertEquals(2, dslContext.fetchCount(PROCESSING_ATTEMPTS))
    }

    @Test
    fun `rejects inconsistent attempt state`() {
        val orderId = insertOrder()

        assertThrows(DataAccessException::class.java) {
            insertAttempt(orderId = orderId, status = "SUCCEEDED")
        }
        assertThrows(DataAccessException::class.java) {
            insertAttempt(
                orderId = orderId,
                status = "FAILED",
                completedAt = startedAt.plusSeconds(1),
            )
        }
    }

    @Test
    fun `rejects completion before the attempt started`() {
        val orderId = insertOrder()

        assertThrows(DataAccessException::class.java) {
            insertAttempt(
                orderId = orderId,
                status = "SUCCEEDED",
                completedAt = startedAt.minusSeconds(1),
            )
        }
    }

    private fun insertAttempt(
        orderId: UUID,
        attemptNumber: Int = 1,
        status: String = "STARTED",
        triggerType: String = "INITIAL",
        errorCode: String? = null,
        errorMessage: String? = null,
        completedAt: OffsetDateTime? = null,
    ) {
        dslContext
            .insertInto(PROCESSING_ATTEMPTS)
            .set(PROCESSING_ATTEMPTS.ID, UUID.randomUUID())
            .set(PROCESSING_ATTEMPTS.ORDER_ID, orderId)
            .set(PROCESSING_ATTEMPTS.ATTEMPT_NUMBER, attemptNumber)
            .set(PROCESSING_ATTEMPTS.STATUS, status)
            .set(PROCESSING_ATTEMPTS.TRIGGER_TYPE, triggerType)
            .set(PROCESSING_ATTEMPTS.ERROR_CODE, errorCode)
            .set(PROCESSING_ATTEMPTS.ERROR_MESSAGE, errorMessage)
            .set(PROCESSING_ATTEMPTS.STARTED_AT, startedAt)
            .set(PROCESSING_ATTEMPTS.COMPLETED_AT, completedAt)
            .execute()
    }

    private fun insertOrder(): UUID {
        val orderId = UUID.randomUUID()
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, orderId)
            .set(ORDERS.SOURCE_SYSTEM, "migration-test-${UUID.randomUUID()}")
            .set(ORDERS.EXTERNAL_ORDER_ID, "external-${UUID.randomUUID()}")
            .set(ORDERS.STATUS, "RECEIVED")
            .set(ORDERS.CURRENCY, "EUR")
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal.ZERO)
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.RECEIVED_AT, startedAt)
            .execute()
        return orderId
    }
}
