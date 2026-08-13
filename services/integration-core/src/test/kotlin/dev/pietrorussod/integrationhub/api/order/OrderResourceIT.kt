package dev.pietrorussod.integrationhub.api.order

import dev.pietrorussod.integrationhub.infrastructure.persistence.jooq.generated.tables.Orders.Companion.ORDERS
import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import jakarta.inject.Inject
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.matchesPattern
import org.jooq.DSLContext
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@QuarkusTest
class OrderResourceIT {
    @Inject
    lateinit var dslContext: DSLContext

    @BeforeEach
    fun deleteOrders() {
        dslContext.deleteFrom(ORDERS).execute()
    }

    @Test
    fun `creates an order`() {
        given()
            .contentType("application/json")
            .body(validOrderRequest())
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(201)
            .header("Location", matchesPattern(".*/api/v1/orders/[0-9a-f-]+"))
            .header("Idempotent-Replay", equalTo("false"))
            .body("sourceSystem", equalTo("MARKETPLACE_A"))
            .body("externalId", equalTo("ORDER-2026-00042"))
            .body("currency", equalTo("EUR"))
            .body("totalAmount", equalTo("39.98"))
            .body("status", equalTo("RECEIVED"))
            .body("items[0].lineAmount", equalTo("39.98"))
    }

    @Test
    fun `returns the existing order for an equivalent replay`() {
        val firstResponse =
            given()
                .contentType("application/json")
                .body(validOrderRequest())
                .post("/api/v1/orders")

        val orderId = firstResponse.jsonPath().getString("id")

        given()
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
            given()
                .contentType("application/json")
                .body(validOrderRequest())
                .post("/api/v1/orders")
        val orderId = createdOrder.jsonPath().getString("id")

        given()
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
        given()
            .`when`()
            .get("/api/v1/orders/018f38c2-1b95-7cc4-bb89-72d26a6f9f99")
            .then()
            .statusCode(404)
            .contentType("application/problem+json")
            .body("code", equalTo("ORDER_NOT_FOUND"))
    }

    @Test
    fun `rejects a malformed order id`() {
        given()
            .`when`()
            .get("/api/v1/orders/not-a-uuid")
            .then()
            .statusCode(400)
            .contentType("application/problem+json")
            .body("code", equalTo("INVALID_ORDER_ID"))
    }

    @Test
    fun `reports a conflict for the same source identity with different content`() {
        given()
            .contentType("application/json")
            .body(validOrderRequest())
            .post("/api/v1/orders")

        given()
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
        given()
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
        given()
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
        given()
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

        given()
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

        given()
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
        given()
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
        given()
            .contentType("text/plain")
            .body(validOrderRequest())
            .`when`()
            .post("/api/v1/orders")
            .then()
            .statusCode(415)
            .contentType("application/problem+json")
            .body("code", equalTo("UNSUPPORTED_MEDIA_TYPE"))
    }

    private fun validOrderRequest(
        currency: String = "EUR",
        declaredTotal: String = "39.98",
        description: String = "First item",
    ): String =
        """
        {
          "sourceSystem": "MARKETPLACE_A",
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
}
