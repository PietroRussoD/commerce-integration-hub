package dev.pietrorussod.integrationhub.api.order

import dev.pietrorussod.integrationhub.api.correlation.CORRELATION_ID_HEADER
import dev.pietrorussod.integrationhub.api.security.SOURCE_API_KEY_HEADER
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.IntegrationEvents.Companion.INTEGRATION_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.OutboxEvents.Companion.OUTBOX_EVENTS
import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.SourceCredentials.Companion.SOURCE_CREDENTIALS
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.specification.RequestSpecification
import jakarta.inject.Inject
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.matchesPattern
import org.jooq.DSLContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.nio.charset.StandardCharsets
import java.time.OffsetDateTime
import java.time.ZoneOffset
import java.util.HexFormat
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@QuarkusTest
class OrderResourceIT {
    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun prepareDatabase() {
        dslContext.deleteFrom(OUTBOX_EVENTS).execute()
        dslContext.deleteFrom(ORDERS).execute()
        dslContext.deleteFrom(SOURCE_CREDENTIALS).execute()
        insertSourceCredential(TEST_KEY_ID, TEST_SECRET, "MARKETPLACE_A")
        insertSourceCredential(OTHER_KEY_ID, OTHER_SECRET, "MARKETPLACE_B")
    }

    @Test
    fun `creates an order`() {
        authenticatedRequest()
            .header(CORRELATION_ID_HEADER, TEST_CORRELATION_ID)
            .contentType("application/json")
            .body(validOrderRequest())
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(201)
            .header("Location", matchesPattern(".*/api/v1/orders/[0-9a-f-]+"))
            .header("Idempotent-Replay", equalTo("false"))
            .header(CORRELATION_ID_HEADER, equalTo(TEST_CORRELATION_ID))
            .body("sourceSystem", equalTo("MARKETPLACE_A"))
            .body("externalId", equalTo("ORDER-2026-00042"))
            .body("currency", equalTo("EUR"))
            .body("totalAmount", equalTo("39.98"))
            .body("status", equalTo("RECEIVED"))
            .body("items[0].lineAmount", equalTo("39.98"))

        val expectedCorrelationId = UUID.fromString(TEST_CORRELATION_ID)
        assertEquals(expectedCorrelationId, dslContext.selectFrom(INTEGRATION_EVENTS).fetchSingle().correlationId)
        assertEquals(expectedCorrelationId, dslContext.selectFrom(OUTBOX_EVENTS).fetchSingle().correlationId)
    }

    @Test
    fun `returns the existing order for an equivalent replay`() {
        val firstResponse =
            authenticatedRequest()
                .contentType("application/json")
                .body(validOrderRequest())
                .post("/api/v1/orders")

        val orderId = firstResponse.jsonPath().getString("id")

        authenticatedRequest()
            .contentType("application/json")
            .body(validOrderRequest())
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(200)
            .header("Idempotent-Replay", equalTo("true"))
            .body("id", equalTo(orderId))
    }

    @Test
    fun `gets a created order by id`() {
        val createdOrder =
            authenticatedRequest()
                .contentType("application/json")
                .body(validOrderRequest())
                .post("/api/v1/orders")
        val orderId = createdOrder.jsonPath().getString("id")

        authenticatedRequest()
            .`when`()
            .get("/api/v1/orders/$orderId")
            .then()
            .statusCode(200)
            .body("id", equalTo(orderId))
            .body("sourceSystem", equalTo("MARKETPLACE_A"))
            .body("items[0].sku", equalTo("SKU-BOOK-1"))
    }

    @Test
    fun `returns not found for an unknown order id`() {
        authenticatedRequest()
            .`when`()
            .get("/api/v1/orders/018f38c2-1b95-7cc4-bb89-72d26a6f9f99")
            .then()
            .statusCode(404)
            .contentType("application/problem+json")
            .body("code", equalTo("ORDER_NOT_FOUND"))
    }

    @Test
    fun `rejects a malformed order id`() {
        authenticatedRequest()
            .`when`()
            .get("/api/v1/orders/not-a-uuid")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_ORDER_ID"))
    }

    @Test
    fun `reports a conflict for the same source identity with different content`() {
        authenticatedRequest()
            .contentType("application/json")
            .body(validOrderRequest())
            .post("/api/v1/orders")

        authenticatedRequest()
            .contentType("application/json")
            .body(validOrderRequest(description = "Changed item"))
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(409)
            .contentType("application/problem+json")
            .body("code", equalTo("ORDER_PAYLOAD_CONFLICT"))
    }

    @Test
    fun `returns problem details for a domain validation error`() {
        authenticatedRequest()
            .contentType("application/json")
            .body(validOrderRequest(declaredTotal = "39.97"))
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_ORDER_REQUEST"))
            .body("detail", equalTo("The order request violates a business rule."))
    }

    @Test
    fun `returns field errors for request validation failures`() {
        authenticatedRequest()
            .contentType("application/json")
            .body(validOrderRequest(currency = "CHF"))
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("REQUEST_VALIDATION_FAILED"))
            .body("errors[0].field", equalTo("currency"))
    }

    @Test
    fun `returns problem details for malformed JSON`() {
        authenticatedRequest()
            .contentType("application/json")
            .body("{broken")
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_JSON_BODY"))
    }

    @Test
    fun `returns problem details for an unknown request field`() {
        val requestWithUnknownField = validOrderRequest().replaceFirst("{", "{\"unexpected\": true,")

        authenticatedRequest()
            .contentType("application/json")
            .body(requestWithUnknownField)
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_JSON_BODY"))
    }

    @Test
    fun `returns problem details for a missing required request field`() {
        val requestWithoutCurrency = validOrderRequest().replace("\"currency\": \"EUR\",", "")

        authenticatedRequest()
            .contentType("application/json")
            .body(requestWithoutCurrency)
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("REQUEST_VALIDATION_FAILED"))
            .body("errors[0].field", equalTo("currency"))
    }

    @Test
    fun `returns problem details for an empty request body`() {
        authenticatedRequest()
            .contentType("application/json")
            .body("")
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_JSON_BODY"))
    }

    @Test
    fun `returns problem details for an unsupported media type`() {
        authenticatedRequest()
            .contentType("text/plain")
            .body(validOrderRequest())
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(415)
            .contentType("application/problem+json")
            .body("code", equalTo("UNSUPPORTED_MEDIA_TYPE"))
    }

    @Test
    fun `rejects a missing source API key before reading the request body`() {
        given()
            .header(CORRELATION_ID_HEADER, "untrusted-value")
            .contentType("application/json")
            .body("{broken")
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(401)
            .header("WWW-Authenticate", equalTo("SourceApiKey"))
            .header(CORRELATION_ID_HEADER, matchesPattern(CANONICAL_UUID_PATTERN))
            .contentType("application/problem+json")
            .body("code", equalTo("SOURCE_AUTHENTICATION_REQUIRED"))
    }

    @Test
    fun `rejects an incorrect source API key with the generic authentication response`() {
        given()
            .header(SOURCE_API_KEY_HEADER, "$TEST_KEY_ID.${"x".repeat(43)}")
            .contentType("application/json")
            .body(validOrderRequest())
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(401)
            .contentType("application/problem+json")
            .body("code", equalTo("SOURCE_AUTHENTICATION_REQUIRED"))
    }

    @Test
    fun `rejects a client supplied source system`() {
        val requestWithSourceSystem = validOrderRequest().replaceFirst("{", "{\"sourceSystem\": \"OTHER\",")

        authenticatedRequest()
            .contentType("application/json")
            .body(requestWithSourceSystem)
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_JSON_BODY"))
    }

    @Test
    fun `does not expose an order to another authenticated source`() {
        val createdOrder =
            authenticatedRequest()
                .contentType("application/json")
                .body(validOrderRequest())
                .post("/api/v1/orders")
        val orderId = createdOrder.jsonPath().getString("id")

        otherSourceAuthenticatedRequest()
            .`when`()
            .get("/api/v1/orders/$orderId")
            .then()
            .statusCode(404)
            .contentType("application/problem+json")
            .body("code", equalTo("ORDER_NOT_FOUND"))
    }

    @Test
    fun `rejects an unauthenticated order read`() {
        given()
            .`when`()
            .get("/api/v1/orders/018f38c2-1b95-7cc4-bb89-72d26a6f9f52")
            .then()
            .statusCode(401)
            .body("code", equalTo("SOURCE_AUTHENTICATION_REQUIRED"))
    }

    private fun authenticatedRequest(): RequestSpecification = given().header(SOURCE_API_KEY_HEADER, "$TEST_KEY_ID.$TEST_SECRET")

    private fun otherSourceAuthenticatedRequest(): RequestSpecification =
        given().header(SOURCE_API_KEY_HEADER, "$OTHER_KEY_ID.$OTHER_SECRET")

    private fun insertSourceCredential(
        keyId: String,
        secret: String,
        sourceSystem: String,
    ) {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(TEST_PEPPER, "HmacSHA256"))
        val secretMac = HexFormat.of().formatHex(mac.doFinal(secret.toByteArray(StandardCharsets.UTF_8)))

        dslContext
            .insertInto(SOURCE_CREDENTIALS)
            .set(SOURCE_CREDENTIALS.KEY_ID, keyId)
            .set(SOURCE_CREDENTIALS.SOURCE_SYSTEM, sourceSystem)
            .set(SOURCE_CREDENTIALS.SECRET_MAC, secretMac)
            .set(SOURCE_CREDENTIALS.PEPPER_VERSION, 1)
            .set(SOURCE_CREDENTIALS.STATUS, "ACTIVE")
            .set(SOURCE_CREDENTIALS.CREATED_AT, OffsetDateTime.of(2026, 1, 1, 0, 0, 0, 0, ZoneOffset.UTC))
            .execute()
    }

    private fun validOrderRequest(
        currency: String = "EUR",
        declaredTotal: String = "39.98",
        description: String = "First item",
    ): String =
        """
        {
          "externalId": "ORDER-2026-00042",
          "currency": "$currency",
          "declaredTotalAmount": "$declaredTotal",
          "items": [
            {
              "externalLineId": "1",
              "sku": "SKU-BOOK-1",
              "description": "$description",
              "quantity": "2",
              "unitPrice": "19.99"
            }
          ]
        }
        """.trimIndent()

    private companion object {
        const val TEST_KEY_ID = "test-key-id-0001"
        const val TEST_SECRET = "sssssssssssssssssssssssssssssssssssssssssss"
        const val OTHER_KEY_ID = "test-key-id-0002"
        const val OTHER_SECRET = "ttttttttttttttttttttttttttttttttttttttttttt"
        const val TEST_CORRELATION_ID = "018f38c2-1b95-7cc4-bb89-72d26a6f9f55"
        const val CANONICAL_UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
        val TEST_PEPPER = ByteArray(32)
    }
}
