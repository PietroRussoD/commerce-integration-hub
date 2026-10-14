package dev.pietrorussod.integrationhub.infrastructure.observability

import dev.pietrorussod.integrationhub.application.outbox.OutboxBacklog
import io.micrometer.core.instrument.simple.SimpleMeterRegistry
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

class OutboxBacklogMetricsTest {
    private val now = Instant.parse("2026-10-13T12:00:00Z")
    private val registry = SimpleMeterRegistry()
    private var backlog: () -> OutboxBacklog = { OutboxBacklog(0, null, 0) }
    private val metrics = OutboxBacklogMetrics(registry) { backlog() }

    @Test
    fun `is unknown before the first refresh`() {
        assertTrue(gauge(OutboxBacklogMetrics.BACKLOG_EVENTS_METRIC).isNaN())
        assertTrue(gauge(OutboxBacklogMetrics.BACKLOG_OLDEST_AGE_METRIC).isNaN())
        assertTrue(gauge(OutboxBacklogMetrics.FAILED_EVENTS_METRIC).isNaN())
    }

    @Test
    fun `reports the waiting events, the age of the oldest and the failed events`() {
        backlog = { OutboxBacklog(waitingEvents = 42, oldestWaitingCreatedAt = now.minusMillis(90_500), failedEvents = 3) }

        metrics.refresh(now)

        assertEquals(42.0, gauge(OutboxBacklogMetrics.BACKLOG_EVENTS_METRIC))
        assertEquals(90.5, gauge(OutboxBacklogMetrics.BACKLOG_OLDEST_AGE_METRIC))
        assertEquals(3.0, gauge(OutboxBacklogMetrics.FAILED_EVENTS_METRIC))
    }

    @Test
    fun `reports an age of zero when nothing waits`() {
        metrics.refresh(now)

        assertEquals(0.0, gauge(OutboxBacklogMetrics.BACKLOG_EVENTS_METRIC))
        assertEquals(0.0, gauge(OutboxBacklogMetrics.BACKLOG_OLDEST_AGE_METRIC))
    }

    @Test
    fun `never reports a negative age when the clocks disagree`() {
        backlog = { OutboxBacklog(waitingEvents = 1, oldestWaitingCreatedAt = now.plusSeconds(2), failedEvents = 0) }

        metrics.refresh(now)

        assertEquals(0.0, gauge(OutboxBacklogMetrics.BACKLOG_OLDEST_AGE_METRIC))
    }

    @Test
    fun `becomes unknown again when a refresh fails`() {
        backlog = { OutboxBacklog(waitingEvents = 5, oldestWaitingCreatedAt = now.minusSeconds(10), failedEvents = 0) }
        metrics.refresh(now)
        backlog = { throw IllegalStateException("database unavailable") }

        assertThrows(IllegalStateException::class.java) { metrics.refresh(now) }

        assertTrue(gauge(OutboxBacklogMetrics.BACKLOG_EVENTS_METRIC).isNaN())
        assertTrue(gauge(OutboxBacklogMetrics.BACKLOG_OLDEST_AGE_METRIC).isNaN())
        assertTrue(gauge(OutboxBacklogMetrics.FAILED_EVENTS_METRIC).isNaN())
    }

    @Test
    fun `rejects an inconsistent backlog`() {
        assertThrows(
            IllegalArgumentException::class.java,
        ) { OutboxBacklog(waitingEvents = 1, oldestWaitingCreatedAt = null, failedEvents = 0) }
        assertThrows(
            IllegalArgumentException::class.java,
        ) { OutboxBacklog(waitingEvents = 0, oldestWaitingCreatedAt = now, failedEvents = 0) }
        assertThrows(
            IllegalArgumentException::class.java,
        ) { OutboxBacklog(waitingEvents = -1, oldestWaitingCreatedAt = null, failedEvents = 0) }
    }

    private fun gauge(name: String): Double = registry.get(name).gauge().value()
}
