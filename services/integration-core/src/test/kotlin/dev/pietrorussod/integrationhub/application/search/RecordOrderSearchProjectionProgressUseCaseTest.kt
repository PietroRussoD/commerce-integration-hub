package dev.pietrorussod.integrationhub.application.search

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class RecordOrderSearchProjectionProgressUseCaseTest {
    @Test
    fun `records an event with the projection completion time`() {
        val repository = mock(OrderSearchProjectionProgressRepository::class.java)
        val projectedAt = Instant.parse("2026-09-09T08:00:00Z")
        val useCase =
            RecordOrderSearchProjectionProgressUseCase(
                progressRepository = repository,
                clock = Clock.fixed(projectedAt, ZoneOffset.UTC),
            )
        val eventOccurredAt = Instant.parse("2026-09-09T07:59:59Z")
        `when`(repository.recordSuccessfulProjection(eventOccurredAt, projectedAt)).thenReturn(true)

        assertEquals(projectedAt, useCase.record(eventOccurredAt))

        verify(repository).recordSuccessfulProjection(eventOccurredAt, projectedAt)
    }
}
