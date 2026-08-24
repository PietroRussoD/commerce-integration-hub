package dev.pietrorussod.integrationhub.api.operator

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OrderItems.Companion.ORDER_ITEMS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.ProcessingAttempts.Companion.PROCESSING_ATTEMPTS
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import jakarta.inject.Inject
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.nullValue
import org.jooq.DSLContext
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.Instant
import java.time.ZoneOffset
import java.util.UUID

@QuarkusTest
class OperatorOrderResourceIT {
    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteData() {
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
        dslContext.deleteFrom(PROCESSING_ATTEMPTS).execute()
        dslContext.deleteFrom(INTEGRATION_EVENTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `lists an empty order page`() {
        given()
            .`when`()
            .get("/api/v1/operator/orders")
            .then()
            .statusCode(200)
            .body("items.size()", equalTo(0))
            .body("limit", equalTo(25))
            .body("offset", equalTo(0))
            .body("total", equalTo(0))
    }

    @Test
    fun `lists order summaries newest first`() {
        val olderOrderId =
            insertOrder(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f11"),
                externalOrderId = "ORDER-OLDER",
                status = "RECEIVED",
                receivedAt = Instant.parse("2026-08-21T08:00:00Z"),
            )
        insertTimelineEvent(olderOrderId, "ORDER_RECEIVED", "RECEIVED", Instant.parse("2026-08-21T08:00:01Z"))

        val newerOrderId =
            insertOrder(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f22"),
                externalOrderId = "ORDER-NEWER",
                status = "READY",
                receivedAt = Instant.parse("2026-08-21T09:00:00Z"),
            )
        insertTimelineEvent(newerOrderId, "ORDER_RECEIVED", "RECEIVED", Instant.parse("2026-08-21T09:00:01Z"))
        insertTimelineEvent(newerOrderId, "PROCESSING_SUCCEEDED", "READY", Instant.parse("2026-08-21T09:00:03Z"))
        insertProcessingAttempt(newerOrderId, 1)

        given()
            .`when`()
            .get("/api/v1/operator/orders")
            .then()
            .statusCode(200)
            .body("items.size()", equalTo(2))
            .body("items[0].id", equalTo(newerOrderId.toString()))
            .body("items[0].sourceSystem", equalTo("MARKETPLACE_A"))
            .body("items[0].externalOrderId", equalTo("ORDER-NEWER"))
            .body("items[0].status", equalTo("READY"))
            .body("items[0].currency", equalTo("EUR"))
            .body("items[0].totalAmount", equalTo("39.98"))
            .body("items[0].lastEventAt", equalTo("2026-08-21T09:00:03Z"))
            .body("items[0].processingAttempts", equalTo(1))
            .body("items[1].id", equalTo(olderOrderId.toString()))
            .body("items[1].processingAttempts", equalTo(0))
            .body("total", equalTo(2))
    }

    @Test
    fun `gets an order with items timeline and processing attempts`() {
        val orderId =
            insertOrder(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f88"),
                externalOrderId = "ORDER-DETAIL",
                status = "READY",
                receivedAt = Instant.parse("2026-08-21T08:00:00Z"),
            )
        insertOrderItem(orderId, "LINE-2", "SKU-2", BigDecimal("1.0000"), BigDecimal("20.0000"), 1)
        insertOrderItem(orderId, "LINE-1", "SKU-1", BigDecimal("2.0000"), BigDecimal("9.9900"), 0)

        val receivedCorrelationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9001")
        insertTimelineEvent(
            orderId = orderId,
            eventType = "PROCESSING_SUCCEEDED",
            toStatus = "READY",
            occurredAt = Instant.parse("2026-08-21T08:00:05Z"),
            fromStatus = "PROCESSING",
        )
        insertTimelineEvent(
            orderId = orderId,
            eventType = "ORDER_RECEIVED",
            toStatus = "RECEIVED",
            occurredAt = Instant.parse("2026-08-21T08:00:01Z"),
            message = "Order accepted",
            correlationId = receivedCorrelationId,
        )

        insertProcessingAttempt(
            orderId = orderId,
            attemptNumber = 2,
            status = "SUCCEEDED",
            triggerType = "AUTOMATIC_RETRY",
            startedAt = Instant.parse("2026-08-21T08:00:04Z"),
        )
        insertProcessingAttempt(
            orderId = orderId,
            attemptNumber = 1,
            status = "FAILED",
            triggerType = "INITIAL",
            errorCode = "PROVIDER_TIMEOUT",
            errorMessage = "Provider did not respond in time",
            startedAt = Instant.parse("2026-08-21T08:00:02Z"),
        )

        given()
            .`when`()
            .get("/api/v1/operator/orders/$orderId")
            .then()
            .statusCode(200)
            .body("id", equalTo(orderId.toString()))
            .body("sourceSystem", equalTo("MARKETPLACE_A"))
            .body("externalOrderId", equalTo("ORDER-DETAIL"))
            .body("status", equalTo("READY"))
            .body("currency", equalTo("EUR"))
            .body("totalAmount", equalTo("39.98"))
            .body("receivedAt", equalTo("2026-08-21T08:00:00Z"))
            .body("items.size()", equalTo(2))
            .body("items[0].externalLineId", equalTo("LINE-1"))
            .body("items[0].quantity", equalTo("2.0000"))
            .body("items[0].unitPrice", equalTo("9.9900"))
            .body("items[0].lineAmount", equalTo("19.98"))
            .body("items[0].position", equalTo(0))
            .body("items[1].externalLineId", equalTo("LINE-2"))
            .body("timeline.size()", equalTo(2))
            .body("timeline[0].eventType", equalTo("ORDER_RECEIVED"))
            .body("timeline[0].fromStatus", nullValue())
            .body("timeline[0].toStatus", equalTo("RECEIVED"))
            .body("timeline[0].message", equalTo("Order accepted"))
            .body("timeline[0].correlationId", equalTo(receivedCorrelationId.toString()))
            .body("timeline[1].eventType", equalTo("PROCESSING_SUCCEEDED"))
            .body("processingAttempts.size()", equalTo(2))
            .body("processingAttempts[0].attemptNumber", equalTo(1))
            .body("processingAttempts[0].status", equalTo("FAILED"))
            .body("processingAttempts[0].trigger", equalTo("INITIAL"))
            .body("processingAttempts[0].errorCode", equalTo("PROVIDER_TIMEOUT"))
            .body("processingAttempts[0].errorMessage", equalTo("Provider did not respond in time"))
            .body("processingAttempts[1].attemptNumber", equalTo(2))
            .body("processingAttempts[1].status", equalTo("SUCCEEDED"))
            .body("processingAttempts[1].trigger", equalTo("AUTOMATIC_RETRY"))
    }

    @Test
    fun `rejects an invalid operator order id`() {
        given()
            .`when`()
            .get("/api/v1/operator/orders/not-a-uuid")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_ORDER_ID"))
    }

    @Test
    fun `returns not found for an unknown operator order id`() {
        val orderId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9999")

        given()
            .`when`()
            .get("/api/v1/operator/orders/$orderId")
            .then()
            .statusCode(404)
            .contentType("application/problem+json")
            .body("code", equalTo("ORDER_NOT_FOUND"))
    }

    @Test
    fun `filters order summaries by status`() {
        insertOrder(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f33"),
            externalOrderId = "ORDER-RECEIVED",
            status = "RECEIVED",
            receivedAt = Instant.parse("2026-08-21T08:00:00Z"),
        )
        val readyOrderId =
            insertOrder(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f44"),
                externalOrderId = "ORDER-READY",
                status = "READY",
                receivedAt = Instant.parse("2026-08-21T09:00:00Z"),
            )

        given()
            .queryParam("status", "ready")
            .`when`()
            .get("/api/v1/operator/orders")
            .then()
            .statusCode(200)
            .body("items.size()", equalTo(1))
            .body("items[0].id", equalTo(readyOrderId.toString()))
            .body("items[0].status", equalTo("READY"))
            .body("total", equalTo(1))
    }

    @Test
    fun `applies offset pagination`() {
        insertOrder(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
            externalOrderId = "ORDER-1",
            status = "RECEIVED",
            receivedAt = Instant.parse("2026-08-21T08:00:00Z"),
        )
        val secondOrderId =
            insertOrder(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f66"),
                externalOrderId = "ORDER-2",
                status = "RECEIVED",
                receivedAt = Instant.parse("2026-08-21T09:00:00Z"),
            )
        insertOrder(
            id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f77"),
            externalOrderId = "ORDER-3",
            status = "RECEIVED",
            receivedAt = Instant.parse("2026-08-21T10:00:00Z"),
        )

        given()
            .queryParam("limit", 1)
            .queryParam("offset", 1)
            .`when`()
            .get("/api/v1/operator/orders")
            .then()
            .statusCode(200)
            .body("items.size()", equalTo(1))
            .body("items[0].id", equalTo(secondOrderId.toString()))
            .body("limit", equalTo(1))
            .body("offset", equalTo(1))
            .body("total", equalTo(3))
    }

    @Test
    fun `rejects an invalid status filter`() {
        given()
            .queryParam("status", "SHIPPED")
            .`when`()
            .get("/api/v1/operator/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_OPERATOR_ORDER_QUERY"))
    }

    @Test
    fun `rejects invalid pagination parameters`() {
        given()
            .queryParam("limit", 0)
            .`when`()
            .get("/api/v1/operator/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("errors[0].field", equalTo("limit"))

        given()
            .queryParam("offset", -1)
            .`when`()
            .get("/api/v1/operator/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("errors[0].field", equalTo("offset"))
    }

    private fun insertOrder(
        id: UUID,
        externalOrderId: String,
        status: String,
        receivedAt: Instant,
    ): UUID {
        dslContext
            .insertInto(ORDERS)
            .set(ORDERS.ID, id)
            .set(ORDERS.SOURCE_SYSTEM, "MARKETPLACE_A")
            .set(ORDERS.EXTERNAL_ORDER_ID, externalOrderId)
            .set(ORDERS.STATUS, status)
            .set(ORDERS.CURRENCY, "EUR")
            .set(ORDERS.TOTAL_AMOUNT, BigDecimal("39.98"))
            .set(ORDERS.PAYLOAD_FINGERPRINT, "a".repeat(64))
            .set(ORDERS.PAYLOAD_FINGERPRINT_VERSION, 1)
            .set(ORDERS.RECEIVED_AT, receivedAt.atOffset(ZoneOffset.UTC))
            .execute()
        return id
    }

    private fun insertTimelineEvent(
        orderId: UUID,
        eventType: String,
        toStatus: String,
        occurredAt: Instant,
        fromStatus: String? = null,
        message: String? = null,
        correlationId: UUID = UUID.randomUUID(),
    ) {
        dslContext
            .insertInto(INTEGRATION_EVENTS)
            .set(INTEGRATION_EVENTS.ID, UUID.randomUUID())
            .set(INTEGRATION_EVENTS.ORDER_ID, orderId)
            .set(INTEGRATION_EVENTS.EVENT_TYPE, eventType)
            .set(INTEGRATION_EVENTS.FROM_STATUS, fromStatus)
            .set(INTEGRATION_EVENTS.TO_STATUS, toStatus)
            .set(INTEGRATION_EVENTS.MESSAGE, message)
            .set(INTEGRATION_EVENTS.CORRELATION_ID, correlationId)
            .set(INTEGRATION_EVENTS.OCCURRED_AT, occurredAt.atOffset(ZoneOffset.UTC))
            .execute()
    }

    private fun insertProcessingAttempt(
        orderId: UUID,
        attemptNumber: Int,
        status: String = "SUCCEEDED",
        triggerType: String = "INITIAL",
        errorCode: String? = null,
        errorMessage: String? = null,
        startedAt: Instant = Instant.parse("2026-08-21T09:00:02Z"),
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
            .set(PROCESSING_ATTEMPTS.STARTED_AT, startedAt.atOffset(ZoneOffset.UTC))
            .set(PROCESSING_ATTEMPTS.COMPLETED_AT, startedAt.plusSeconds(1).atOffset(ZoneOffset.UTC))
            .execute()
    }

    private fun insertOrderItem(
        orderId: UUID,
        externalLineId: String,
        sku: String,
        quantity: BigDecimal,
        unitPrice: BigDecimal,
        position: Int,
    ) {
        dslContext
            .insertInto(ORDER_ITEMS)
            .set(ORDER_ITEMS.ID, UUID.randomUUID())
            .set(ORDER_ITEMS.ORDER_ID, orderId)
            .set(ORDER_ITEMS.EXTERNAL_LINE_ID, externalLineId)
            .set(ORDER_ITEMS.SKU, sku)
            .set(ORDER_ITEMS.QUANTITY, quantity)
            .set(ORDER_ITEMS.UNIT_PRICE, unitPrice)
            .set(ORDER_ITEMS.LINE_AMOUNT, quantity.multiply(unitPrice).setScale(2))
            .set(ORDER_ITEMS.POSITION, position)
            .execute()
    }
}
