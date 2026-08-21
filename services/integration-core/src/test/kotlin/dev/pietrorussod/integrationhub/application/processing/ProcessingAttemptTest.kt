package dev.pietrorussod.integrationhub.application.processing

import dev.pietrorussod.integrationhub.domain.order.OrderId
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class ProcessingAttemptTest {
    private val startedAt = Instant.parse("2026-08-21T08:00:00Z")

    @Test
    fun `starts a processing attempt`() {
        val attempt = startAttempt()

        assertEquals(ProcessingAttemptStatus.STARTED, attempt.status)
        assertEquals(ProcessingAttemptTrigger.INITIAL, attempt.trigger)
        assertEquals(1, attempt.attemptNumber)
        assertEquals(startedAt, attempt.startedAt)
        assertNull(attempt.completedAt)
        assertNull(attempt.errorCode)
        assertNull(attempt.errorMessage)
    }

    @Test
    fun `marks a started attempt as succeeded`() {
        val completedAt = startedAt.plusSeconds(2)

        val succeeded = startAttempt().markSucceeded(completedAt)

        assertEquals(ProcessingAttemptStatus.SUCCEEDED, succeeded.status)
        assertEquals(completedAt, succeeded.completedAt)
        assertNull(succeeded.errorCode)
        assertNull(succeeded.errorMessage)
    }

    @Test
    fun `marks a started attempt as failed`() {
        val completedAt = startedAt.plusSeconds(2)

        val failed =
            startAttempt().markFailed(
                completedAt = completedAt,
                errorCode = "UPSTREAM_TIMEOUT",
                errorMessage = "The catalogue service did not respond in time",
            )

        assertEquals(ProcessingAttemptStatus.FAILED, failed.status)
        assertEquals(completedAt, failed.completedAt)
        assertEquals("UPSTREAM_TIMEOUT", failed.errorCode)
        assertEquals("The catalogue service did not respond in time", failed.errorMessage)
    }

    @Test
    fun `rejects a non-positive attempt number`() {
        assertThrows(IllegalArgumentException::class.java) { startAttempt(attemptNumber = 0) }
    }

    @Test
    fun `rejects completing an attempt before it started`() {
        assertThrows(IllegalArgumentException::class.java) {
            startAttempt().markSucceeded(startedAt.minusNanos(1))
        }
    }

    @Test
    fun `rejects completing an attempt more than once`() {
        val succeeded = startAttempt().markSucceeded(startedAt.plusSeconds(1))

        assertThrows(IllegalStateException::class.java) {
            succeeded.markFailed(
                completedAt = startedAt.plusSeconds(2),
                errorCode = "LATE_FAILURE",
                errorMessage = "This transition must not be accepted",
            )
        }
    }

    @Test
    fun `rejects failure without safe error details`() {
        assertThrows(IllegalArgumentException::class.java) {
            startAttempt().markFailed(
                completedAt = startedAt.plusSeconds(1),
                errorCode = " ",
                errorMessage = "The request failed",
            )
        }
    }

    private fun startAttempt(attemptNumber: Int = 1): ProcessingAttempt =
        ProcessingAttempt.start(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
            orderId = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f53")),
            attemptNumber = attemptNumber,
            trigger = ProcessingAttemptTrigger.INITIAL,
            startedAt = startedAt,
        )
}
