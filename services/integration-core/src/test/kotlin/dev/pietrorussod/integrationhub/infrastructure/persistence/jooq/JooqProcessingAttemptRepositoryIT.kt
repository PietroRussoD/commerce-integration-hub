package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.processing.ProcessingAttempt
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptRepository
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptStatus
import dev.pietrorussod.integrationhub.application.processing.ProcessingAttemptTrigger
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class JooqProcessingAttemptRepositoryIT {
    private val startedAt = Instant.parse("2026-08-21T08:00:00Z")

    @Inject
    lateinit var repository: ProcessingAttemptRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteData() {
        dslContext.deleteFrom(PROCESSING_ATTEMPTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `creates a started processing attempt`() {
        val attempt = startAttempt(insertOrder())

        repository.create(attempt)

        val record = dslContext.selectFrom(PROCESSING_ATTEMPTS).fetchSingle()
        assertEquals(attempt.id, record.id)
        assertEquals(attempt.orderId.value, record.orderId)
        assertEquals(1, record.attemptNumber)
        assertEquals("STARTED", record.status)
        assertEquals("INITIAL", record.triggerType)
        assertEquals(startedAt, record.startedAt?.toInstant())
        assertNull(record.completedAt)
        assertNull(record.errorCode)
        assertNull(record.errorMessage)
    }

    @Test
    fun `completes a processing attempt successfully`() {
        val attempt = startAttempt(insertOrder())
        val completedAt = startedAt.plusSeconds(2)
        repository.create(attempt)

        repository.complete(attempt.markSucceeded(completedAt))

        val record = dslContext.selectFrom(PROCESSING_ATTEMPTS).fetchSingle()
        assertEquals("SUCCEEDED", record.status)
        assertEquals(completedAt, record.completedAt?.toInstant())
        assertNull(record.errorCode)
        assertNull(record.errorMessage)
    }

    @Test
    fun `completes a failed processing attempt with error details`() {
        val attempt = startAttempt(insertOrder())
        val completedAt = startedAt.plusSeconds(2)
        repository.create(attempt)

        repository.complete(
            attempt.markFailed(
                completedAt = completedAt,
                errorCode = "UPSTREAM_TIMEOUT",
                errorMessage = "The catalogue service did not respond in time",
            ),
        )

        val record = dslContext.selectFrom(PROCESSING_ATTEMPTS).fetchSingle()
        assertEquals("FAILED", record.status)
        assertEquals(completedAt, record.completedAt?.toInstant())
        assertEquals("UPSTREAM_TIMEOUT", record.errorCode)
        assertEquals("The catalogue service did not respond in time", record.errorMessage)
    }

    @Test
    fun `rejects creating an already completed attempt`() {
        val completed = startAttempt(insertOrder()).markSucceeded(startedAt.plusSeconds(1))

        assertThrows(IllegalArgumentException::class.java) { repository.create(completed) }
        assertEquals(0, dslContext.fetchCount(PROCESSING_ATTEMPTS))
    }

    @Test
    fun `rejects completing a started attempt`() {
        val attempt = startAttempt(insertOrder())
        repository.create(attempt)

        assertThrows(IllegalArgumentException::class.java) { repository.complete(attempt) }
    }

    @Test
    fun `rejects completing the same attempt twice`() {
        val attempt = startAttempt(insertOrder())
        val completed = attempt.markSucceeded(startedAt.plusSeconds(1))
        repository.create(attempt)
        repository.complete(completed)

        assertThrows(IllegalStateException::class.java) { repository.complete(completed) }
        assertEquals(
            ProcessingAttemptStatus.SUCCEEDED.name,
            dslContext.selectFrom(PROCESSING_ATTEMPTS).fetchSingle().status,
        )
    }

    private fun startAttempt(orderId: UUID): ProcessingAttempt =
        ProcessingAttempt.start(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            orderId = OrderId(orderId),
            attemptNumber = 1,
            trigger = ProcessingAttemptTrigger.INITIAL,
            startedAt = startedAt,
        )

    private fun insertOrder(): UUID {
        val orderId = UUID.randomUUID()
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, orderId)
            .set(ORDERS.SOURCE_SYSTEM, "repository-test-${UUID.randomUUID()}")
            .set(ORDERS.EXTERNAL_ORDER_ID, "external-${UUID.randomUUID()}")
            .set(ORDERS.STATUS, "RECEIVED")
            .set(ORDERS.CURRENCY, "EUR")
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal.ZERO)
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.RECEIVED_AT, startedAt.atOffset(ZoneOffset.UTC))
            .execute()
        return orderId
    }
}
