package dev.pietrorussod.integrationhub.api.operator

import io.quarkus.test.common.QuarkusTestResource
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.TestProfile
import io.quarkus.test.oidc.server.OidcWiremockTestResource
import io.restassured.RestAssured.given
import io.smallrye.jwt.build.Jwt
import io.vertx.core.json.JsonObject
import org.hamcrest.Matchers.equalTo
import org.jboss.logmanager.formatters.PatternFormatter
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.Arguments
import org.junit.jupiter.params.provider.MethodSource
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

    @ParameterizedTest(name = "{0}")
    @MethodSource("claimCases")
    fun `enforces operator claim contract before authorization`(
        description: String,
        identityClaims: Map<String, Any?>,
        expectedStatus: Int,
    ) {
        val signedToken =
            Jwt
                .claimsJson(JsonObject(identityClaims).encode())
                .issuer(OperatorOidcTestProfile.ISSUER)
                .audience(OperatorOidcTestProfile.AUDIENCE)
                .sign()
        for (path in listOf(OPERATOR_ORDERS_PATH, OPERATOR_SEARCH_STATUS_PATH)) {
            val response =
                given()
                    .auth()
                    .oauth2(signedToken)
                    .`when`()
                    .get(path)
                    .then()
                    .statusCode(expectedStatus)
            if (expectedStatus == 401) {
                response.header("WWW-Authenticate", equalTo("Bearer"))
            }
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
        @JvmStatic
        fun claimCases(): List<Arguments> {
            fun subjectCase(
                label: String,
                subject: Any?,
                status: Int = 401,
            ) = Arguments.of(label, mapOf("sub" to subject, "groups" to listOf("operator")), status)

            fun groupsCase(
                label: String,
                groups: Any?,
                status: Int = 401,
            ) = Arguments.of(label, mapOf("sub" to "operator-123", "groups" to groups), status)
            return listOf(
                Arguments.of("missing subject", mapOf("groups" to listOf("operator")), 401),
                subjectCase("null subject", null),
                subjectCase("numeric subject", 123),
                subjectCase("empty subject", ""),
                subjectCase("blank subject", " "),
                subjectCase("leading whitespace", " operator-123"),
                subjectCase("trailing whitespace", "operator-123\t"),
                subjectCase("NBSP edge", "\u00A0operator-123"),
                subjectCase("BOM edge", "operator-123\uFEFF"),
                subjectCase("oversized subject", "s".repeat(201)),
                subjectCase("maximum subject", "s".repeat(200), 200),
                subjectCase("internal space", "operator 123", 200),
                Arguments.of("missing groups", mapOf("sub" to "operator-123"), 403),
                groupsCase("null groups", null),
                groupsCase("string groups", "operator"),
                groupsCase("object groups", mapOf("role" to "operator")),
                groupsCase("numeric group", listOf("operator", 123)),
                groupsCase("null group", listOf("operator", null)),
                groupsCase("empty group", listOf("operator", "")),
                groupsCase("oversized group", listOf("operator", "g".repeat(101))),
                groupsCase("too many groups", List(51) { "operator" }),
                groupsCase("maximum group count", List(50) { "operator" }, 200),
                groupsCase("maximum group length", listOf("operator", "g".repeat(100)), 200),
                groupsCase("empty groups", emptyList<String>(), 403),
                groupsCase("unknown role", listOf("viewer"), 403),
                groupsCase("role with whitespace", listOf(" operator "), 403),
                groupsCase("platform administrator", listOf("platform-admin"), 200),
            )
        }

        const val OPERATOR_ORDERS_PATH = "/api/v1/operator/orders"
        const val OPERATOR_SEARCH_STATUS_PATH = "/api/v1/operator/orders/search/status"
    }
}
