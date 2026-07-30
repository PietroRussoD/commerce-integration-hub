package dev.pietrorussod.integrationhub.api

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

@QuarkusTest
class ServiceInfoResourceTest {
    @field:ConfigProperty(name = "quarkus.application.name")
    lateinit var applicationName: String

    @field:ConfigProperty(name = "quarkus.application.version")
    lateinit var applicationVersion: String

    @Test
    fun `returns service metadata`() {
        given()
            .`when`()
            .get("/api/service-info")
            .then()
            .statusCode(200)
            .body("name", equalTo(applicationName))
            .body("status", equalTo("UP"))
            .body("version", equalTo(applicationVersion))
    }
}
