package dev.pietrorussod.integrationhub.api.operator

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.empty
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

@QuarkusTest
class OperatorOpenApiIT {
    @Test
    fun `documents bearer JWT security for every operator operation`() {
        given()
            .accept("application/json")
            .`when`()
            .get("/openapi/integration-core")
            .then()
            .statusCode(200)
            .body("components.securitySchemes.$OPERATOR_JWT_SECURITY_SCHEME.type", equalTo("http"))
            .body("components.securitySchemes.$OPERATOR_JWT_SECURITY_SCHEME.scheme", equalTo("bearer"))
            .body("components.securitySchemes.$OPERATOR_JWT_SECURITY_SCHEME.bearerFormat", equalTo("JWT"))
            .body("paths.'/api/v1/operator/orders'.get.security[0].$OPERATOR_JWT_SECURITY_SCHEME", empty<Any>())
            .body("paths.'/api/v1/operator/orders/{orderId}'.get.security[0].$OPERATOR_JWT_SECURITY_SCHEME", empty<Any>())
            .body("paths.'/api/v1/operator/orders/search'.get.security[0].$OPERATOR_JWT_SECURITY_SCHEME", empty<Any>())
            .body("paths.'/api/v1/operator/orders/search/status'.get.security[0].$OPERATOR_JWT_SECURITY_SCHEME", empty<Any>())
            .body("components.securitySchemes.sourceApiKey.type", equalTo("apiKey"))
            .body("paths.'/api/v1/orders'.post.security[0].sourceApiKey", empty<Any>())
    }
}
