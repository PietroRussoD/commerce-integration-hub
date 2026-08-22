package dev.pietrorussod.integrationhub.infrastructure.processing

import dev.pietrorussod.integrationhub.application.processing.ProcessOrderReceivedCommand
import dev.pietrorussod.integrationhub.domain.order.OrderId
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessedMessages.Companion.PROCESSED_MESSAGES
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID

@QuarkusTest
class TransactionalOrderReceivedProcessorIT {
    @Inject
    lateinit var processor: TransactionalOrderReceivedProcessor

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteProcessedMessages() {
        dslContext.deleteFrom(PROCESSED_MESSAGES).execute()
    }

    @Test
    fun `rolls back the inbox marker when processing fails`() {
        val command =
            ProcessOrderReceivedCommand(
                eventId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f60"),
                orderId = OrderId(UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f99")),
                correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            )

        assertThrows(IllegalArgumentException::class.java) {
            processor.process(command)
        }

        assertEquals(0, dslContext.fetchCount(PROCESSED_MESSAGES))
    }
}
