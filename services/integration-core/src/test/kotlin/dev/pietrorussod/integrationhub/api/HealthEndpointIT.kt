package dev.pietrorussod.integrationhub.api

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

@QuarkusTest
class HealthEndpointIT {
    @Test
    fun `reports live status`() {
        given()
            .`when`()
            .get("/health/live")
            .then()
            .statusCode(200)
            .body("status", equalTo("UP"))
    }

    @Test
    fun `reports ready status`() {
        given()
            .`when`()
            .get("/health/ready")
            .then()
            .statusCode(200)
            .body("status", equalTo("UP"))
    }
}
