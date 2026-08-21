package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.processing.ProcessedMessageRecordOutcome
import dev.pietrorussod.integrationhub.application.processing.ProcessedMessageRepository
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Callable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

@QuarkusTest
class JooqProcessedMessageRepositoryIT {
    private val processedAt = Instant.parse("2026-08-21T08:00:00Z")

    @Inject
    lateinit var repository: ProcessedMessageRepository

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteProcessedMessages() {
        dslContext.deleteFrom(PROCESSED_MESSAGES).execute()
    }

    @Test
    fun `records a new processed event`() {
        val eventId = UUID.randomUUID()

        val outcome = repository.recordIfAbsent("order-processor", eventId, processedAt)

        assertEquals(ProcessedMessageRecordOutcome.RECORDED, outcome)
        val record = dslContext.selectFrom(PROCESSED_MESSAGES).fetchSingle()
        assertEquals("order-processor", record.consumerName)
        assertEquals(eventId, record.eventId)
        assertEquals(processedAt, record.processedAt?.toInstant())
    }

    @Test
    fun `returns duplicate without inserting another row`() {
        val eventId = UUID.randomUUID()
        repository.recordIfAbsent("order-processor", eventId, processedAt)

        val outcome = repository.recordIfAbsent("order-processor", eventId, processedAt.plusSeconds(1))

        assertEquals(ProcessedMessageRecordOutcome.DUPLICATE, outcome)
        assertEquals(1, dslContext.fetchCount(PROCESSED_MESSAGES))
        assertEquals(
            processedAt,
            dslContext
                .selectFrom(PROCESSED_MESSAGES)
                .fetchSingle()
                .processedAt
                ?.toInstant(),
        )
    }

    @Test
    fun `allows independent consumers to record the same event`() {
        val eventId = UUID.randomUUID()

        val orderOutcome = repository.recordIfAbsent("order-processor", eventId, processedAt)
        val searchOutcome = repository.recordIfAbsent("search-projector", eventId, processedAt)

        assertEquals(ProcessedMessageRecordOutcome.RECORDED, orderOutcome)
        assertEquals(ProcessedMessageRecordOutcome.RECORDED, searchOutcome)
        assertEquals(2, dslContext.fetchCount(PROCESSED_MESSAGES))
    }

    @Test
    fun `records one effect when the same event arrives concurrently`() {
        val eventId = UUID.randomUUID()
        val executor = Executors.newFixedThreadPool(2)
        val start = CountDownLatch(1)

        try {
            val futures =
                List(2) {
                    executor.submit(
                        Callable {
                            start.await()
                            repository.recordIfAbsent("order-processor", eventId, processedAt)
                        },
                    )
                }

            start.countDown()
            val outcomes = futures.map { it.get(10, TimeUnit.SECONDS) }

            assertEquals(
                setOf(
                    ProcessedMessageRecordOutcome.RECORDED,
                    ProcessedMessageRecordOutcome.DUPLICATE,
                ),
                outcomes.toSet(),
            )
            assertEquals(1, dslContext.fetchCount(PROCESSED_MESSAGES))
        } finally {
            executor.shutdownNow()
        }
    }
}
