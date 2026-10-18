package dev.pietrorussod.integrationhub.api.operator

import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.TestProfile
import io.quarkus.test.oidc.server.OidcWiremockTestResource
import io.restassured.RestAssured.given
import io.smallrye.jwt.build.Jwt
import org.hamcrest.Matchers.equalTo
import org.jboss.logmanager.formatters.PatternFormatter
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.security.KeyPairGenerator
import java.time.Instant
import java.util.concurrent.CopyOnWriteArrayList
import java.util.logging.Handler
import java.util.logging.LogRecord
import java.util.logging.Logger

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

    @Test
    fun `rejects invalid signatures and unknown keys without disclosing tokens in console diagnostics`() {
        val signedToken = token(groups = setOf("operator"))
        val segments = signedToken.split('.')
        val changedSignature = (if (segments[2][0] == 'A') "B" else "A") + segments[2].drop(1)
        val invalidSignatureToken = "${segments[0]}.${segments[1]}.$changedSignature"
        val unknownSigningKey =
            KeyPairGenerator
                .getInstance("RSA")
                .apply { initialize(2048) }
                .generateKeyPair()
                .private
        val unknownKeyToken =
            Jwt
                .subject("operator-123")
                .groups(setOf("operator"))
                .issuer(OperatorOidcTestProfile.ISSUER)
                .audience(OperatorOidcTestProfile.AUDIENCE)
                .jws()
                .keyId("untrusted-test-key")
                .sign(unknownSigningKey)
        val diagnostics = CopyOnWriteArrayList<String>()
        val formatter = PatternFormatter("%s%e")
        val handler =
            object : Handler() {
                override fun publish(record: LogRecord) {
                    if (record.loggerName == "io.quarkus.oidc.runtime.OidcProvider") {
                        diagnostics.add(formatter.format(record))
                    }
                }

                override fun flush() = Unit

                override fun close() = Unit
            }
        // The configured synchronous console handler sanitizes the record before
        // this additional root handler observes the emitted diagnostic.
        val rootLogger = Logger.getLogger("")
        rootLogger.addHandler(handler)
        try {
            for (rejectedToken in listOf(invalidSignatureToken, unknownKeyToken)) {
                given()
                    .auth()
                    .oauth2(rejectedToken)
                    .`when`()
                    .get(OPERATOR_ORDERS_PATH)
                    .then()
                    .statusCode(401)
                    .header("WWW-Authenticate", equalTo("Bearer"))
            }

            assertTrue(diagnostics.count { it == "Operator bearer token verification failed" } >= 2)
            val output = diagnostics.joinToString("\n")
            for (rejectedToken in listOf(invalidSignatureToken, unknownKeyToken)) {
                for (segment in rejectedToken.split('.')) {
                    assertFalse(output.contains(segment), "OIDC diagnostics must not disclose JWT segments")
                }
            }
            assertFalse(output.contains("Invalid JWS Signature"))
            assertFalse(output.contains("UnresolvableKeyException"))
        } finally {
            rootLogger.removeHandler(handler)
        }
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
