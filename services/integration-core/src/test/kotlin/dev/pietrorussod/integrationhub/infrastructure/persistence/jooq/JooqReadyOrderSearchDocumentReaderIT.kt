package dev.pietrorussod.integrationhub.infrastructure.persistence.jooq

import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCounter
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentCursor
import dev.pietrorussod.integrationhub.application.search.ReadyOrderSearchDocumentReader
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class JooqReadyOrderSearchDocumentReaderIT {
    @Inject
    lateinit var reader: ReadyOrderSearchDocumentReader

    @Inject
    lateinit var counter: ReadyOrderSearchDocumentCounter

    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteData() {
        dslContext.deleteFrom(INTEGRATION_EVENTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `reads ready orders in stable pages with their ready event and items`() {
        val firstId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9011")
        val secondId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9012")
        val thirdId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9013")
        val receivedAt = Instant.parse("2026-09-08T08:00:00Z")

        insertReadyOrder(firstId, "ORDER-1", receivedAt, receivedAt.plusSeconds(30), 3)
        insertReadyOrder(secondId, "ORDER-2", receivedAt, receivedAt.plusSeconds(45), 4)
        insertOrder(thirdId, "ORDER-3", receivedAt.plusSeconds(60), "PROCESSING", 2)

        val firstPage = reader.readPage(after = null, limit = 1)
        val secondPage =
            reader.readPage(
                after = ReadyOrderSearchDocumentCursor(firstPage.single().receivedAt, firstPage.single().orderId),
                limit = 1,
            )

        assertEquals(listOf(firstId), firstPage.map { it.orderId })
        assertEquals(listOf(secondId), secondPage.map { it.orderId })
        assertEquals(3, firstPage.single().aggregateVersion)
        assertEquals("marketplace-a", firstPage.single().sourceSystem.value)
        assertEquals("ORDER-1", firstPage.single().externalOrderId)
        assertEquals(receivedAt.plusSeconds(30), firstPage.single().readyAt)
        assertEquals(listOf("SKU-ORDER-1"), firstPage.single().items.map { it.sku })
        assertEquals(
            emptyList<UUID>(),
            reader.readPage(after = ReadyOrderSearchDocumentCursor(receivedAt, secondId), limit = 1).map { it.orderId },
        )
    }

    @Test
    fun `counts only current ready orders`() {
        val receivedAt = Instant.parse("2026-09-08T08:00:00Z")

        insertReadyOrder(UUID.randomUUID(), "ORDER-1", receivedAt, receivedAt.plusSeconds(30), 3)
        insertReadyOrder(UUID.randomUUID(), "ORDER-2", receivedAt.plusSeconds(60), receivedAt.plusSeconds(90), 4)
        insertOrder(UUID.randomUUID(), "ORDER-3", receivedAt.plusSeconds(120), "PROCESSING", 2)

        assertEquals(2L, counter.countReadyDocuments())
    }

    private fun insertReadyOrder(
        id: UUID,
        externalOrderId: String,
        receivedAt: Instant,
        readyAt: Instant,
        aggregateVersion: Long,
    ) {
        insertOrder(id, externalOrderId, receivedAt, "READY", aggregateVersion)
        dslContext
            .insertInto(INTEGRATION_EVENTS)
            .set(INTEGRATION_EVENTS.ID, UUID.randomUUID())
            .set(INTEGRATION_EVENTS.ORDER_ID, id)
            .set(INTEGRATION_EVENTS.EVENT_TYPE, "PROCESSING_SUCCEEDED")
            .set(INTEGRATION_EVENTS.FROM_STATUS, "PROCESSING")
            .set(INTEGRATION_EVENTS.TO_STATUS, "READY")
            .set(INTEGRATION_EVENTS.CORRELATION_ID, UUID.randomUUID())
            .set(INTEGRATION_EVENTS.OCCURRED_AT, readyAt.atOffset(ZoneOffset.UTC))
            .execute()
    }

    private fun insertOrder(
        id: UUID,
        externalOrderId: String,
        receivedAt: Instant,
        status: String,
        aggregateVersion: Long,
    ) {
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, id)
            .set(ORDERS.SOURCE_SYSTEM, "marketplace-a")
            .set(ORDERS.EXTERNAL_ORDER_ID, externalOrderId)
            .set(ORDERS.STATUS, status)
            .set(ORDERS.CURRENCY, "EUR")
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal("12.50"))
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.AGGREGATE_VERSION, aggregateVersion)
            .set(ORDERS.RECEIVED_AT, receivedAt.atOffset(ZoneOffset.UTC))
            .execute()
        dslContext
            .insertInto(ORDER_ITEMS)
            .set(ORDER_ITEMS.ID, UUID.randomUUID())
            .set(ORDER_ITEMS.ORDER_ID, id)
            .set(ORDER_ITEMS.SKU, "SKU-$externalOrderId")
            .set(ORDER_ITEMS.DESCRIPTION, "Item for $externalOrderId")
            .set(ORDER_ITEMS.QUANTITY, BigDecimal.ONE)
            .set(ORDER_ITEMS.UNIT_PRICE, BigDecimal("12.50"))
            .set(ORDER_ITEMS.LINE_AMOUNT, BigDecimal("12.50"))
            .set(ORDER_ITEMS.POSITION, 0)
            .execute()
    }
}
