package dev.pietrorussod.integrationhub.api.operator

import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.TestProfile
import io.quarkus.test.oidc.server.OidcWiremockTestResource
import io.restassured.RestAssured.given
import io.smallrye.jwt.build.Jwt
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test
import java.time.Instant

@QuarkusTest
@TestProfile(OperatorOidcTestProfile::class)
@QuarkusTestResource(value = OidcWiremockTestResource::class, restrictToAnnotatedClass = true)
class OperatorAuthorizationIT {
    @Test
    fun `rejects operator paths without a bearer token`() {
        listOf(OPERATOR_ORDERS_PATH, OPERATOR_SEARCH_STATUS_PATH).forEach { path ->
            given()
                .`when`()
                .get(path)
                .then()
                .statusCode(401)
                .header("WWW-Authenticate", equalTo("Bearer"))
        }
    }

    @Test
    fun `rejects an authenticated identity without an operator role`() {
        given()
            .auth()
            .oauth2(token(groups = setOf("auditor")))
            .`when`()
            .get(OPERATOR_ORDERS_PATH)
            .then()
            .statusCode(403)
    }

    @Test
    fun `allows an operator to read operational orders`() {
        given()
            .auth()
            .oauth2(token(groups = setOf("operator")))
            .`when`()
            .get(OPERATOR_ORDERS_PATH)
            .then()
            .statusCode(200)
    }

    @Test
    fun `allows a platform administrator to read operational orders`() {
        given()
            .auth()
            .oauth2(token(groups = setOf("platform-admin")))
            .`when`()
            .get(OPERATOR_ORDERS_PATH)
            .then()
            .statusCode(200)
    }

    @Test
    fun `rejects a token issued for another audience`() {
        given()
            .auth()
            .oauth2(token(groups = setOf("operator"), audience = "another-service"))
            .`when`()
            .get(OPERATOR_ORDERS_PATH)
            .then()
            .statusCode(401)
    }

    @Test
    fun `rejects a token from another issuer`() {
        given()
            .auth()
            .oauth2(token(groups = setOf("operator"), issuer = "https://untrusted.example.invalid"))
            .`when`()
            .get(OPERATOR_ORDERS_PATH)
            .then()
            .statusCode(401)
    }

    @Test
    fun `rejects an expired token`() {
        given()
            .auth()
            .oauth2(token(groups = setOf("operator"), expiresAt = Instant.now().minusSeconds(60)))
            .`when`()
            .get(OPERATOR_ORDERS_PATH)
            .then()
            .statusCode(401)
    }

    private fun token(
        groups: Set<String>,
        audience: String = OperatorOidcTestProfile.AUDIENCE,
        issuer: String = OperatorOidcTestProfile.ISSUER,
        expiresAt: Instant? = null,
    ): String {
        val claims =
            Jwt
                .subject("operator-123")
                .groups(groups)
                .issuer(issuer)
                .audience(audience)

        expiresAt?.let(claims::expiresAt)
        return claims.sign()
    }

    private companion object {
        const val OPERATOR_ORDERS_PATH = "/api/v1/operator/orders"
        const val OPERATOR_SEARCH_STATUS_PATH = "/api/v1/operator/orders/search/status"
    }
}
