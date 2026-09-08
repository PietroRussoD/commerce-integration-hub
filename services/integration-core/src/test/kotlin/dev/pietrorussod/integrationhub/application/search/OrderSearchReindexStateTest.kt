package dev.pietrorussod.integrationhub.application.search

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class OrderSearchReindexStateTest {
    @Test
    fun `identifies an idle operation`() {
        val state =
            OrderSearchReindexState(
                version = 0,
                phase = OrderSearchReindexPhase.IDLE,
                sourceIndex = null,
                candidateIndex = null,
                cursor = null,
                progress = OrderSearchReindexProgress(0, 0, 0),
                lease = null,
            )

        assertFalse(state.isActive)
    }

    @Test
    fun `identifies an active rebuilding operation`() {
        val state =
            OrderSearchReindexState(
                version = 3,
                phase = OrderSearchReindexPhase.REBUILDING,
                sourceIndex = "orders-v1",
                candidateIndex = "orders-v2",
                cursor = ReadyOrderSearchDocumentCursor(Instant.parse("2026-09-08T12:00:00Z"), UUID.randomUUID()),
                progress = OrderSearchReindexProgress(4, 3, 1),
                lease = null,
            )

        assertTrue(state.isActive)
    }

    @Test
    fun `rejects an active operation without both indices`() {
        assertThrows(IllegalArgumentException::class.java) {
            OrderSearchReindexState(
                version = 0,
                phase = OrderSearchReindexPhase.REBUILDING,
                sourceIndex = "orders-v1",
                candidateIndex = null,
                cursor = null,
                progress = OrderSearchReindexProgress(0, 0, 0),
                lease = null,
            )
        }
    }
}
