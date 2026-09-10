package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgress
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionProgressRepository
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderSearchProjectionProgress.Companion.ORDER_SEARCH_PROJECTION_PROGRESS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.time.Instant

@QuarkusTest
class JooqOrderSearchProjectionProgressRepositoryIT {
    @Inject
    lateinit var repository: OrderSearchProjectionProgressRepository

    @Inject
    lateinit var dslContext: DSLContext

    @Test
    fun `persists the latest successfully projected event watermark`() {
        dslContext
            .update(ORDER_SEARCH_PROJECTION_PROGRESS)
            .setNull(ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_EVENT_OCCURRED_AT)
            .setNull(ORDER_SEARCH_PROJECTION_PROGRESS.LAST_PROJECTED_AT)
            .execute()

        val firstEventAt = Instant.parse("2026-09-09T08:00:00.123456Z")
        val firstProjectedAt = Instant.parse("2026-09-09T08:00:00.323456Z")
        assertTrue(repository.recordSuccessfulProjection(firstEventAt, firstProjectedAt))

        val olderEventAt = Instant.parse("2026-09-09T07:59:59.123456Z")
        assertFalse(repository.recordSuccessfulProjection(olderEventAt, Instant.parse("2026-09-09T08:00:01.123456Z")))

        val latestEventAt = Instant.parse("2026-09-09T08:00:02.123456Z")
        val latestProjectedAt = Instant.parse("2026-09-09T08:00:02.423456Z")
        assertTrue(repository.recordSuccessfulProjection(latestEventAt, latestProjectedAt))

        assertEquals(
            OrderSearchProjectionProgress(
                lastProjectedEventOccurredAt = latestEventAt,
                lastProjectedAt = latestProjectedAt,
            ),
            repository.current(),
        )
    }
}
