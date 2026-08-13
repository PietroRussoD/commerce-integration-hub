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
class OrderResourceTest {
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
