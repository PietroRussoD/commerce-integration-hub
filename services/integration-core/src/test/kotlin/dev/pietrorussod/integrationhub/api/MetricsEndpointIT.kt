package dev.pietrorussod.integrationhub.api

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Test

@QuarkusTest
class MetricsEndpointIT {
    @Test
    fun `exposes outbox metrics in Prometheus format`() {
        given()
            .`when`()
            .get("/metrics")
            .then()
            .statusCode(200)
            .body(containsString("integration_hub_outbox_dispatch_events_total"))
            .body(containsString("integration_hub_outbox_recovery_events_total"))
            .body(containsString("integration_hub_order_search_projection_events_total"))
    }
}
