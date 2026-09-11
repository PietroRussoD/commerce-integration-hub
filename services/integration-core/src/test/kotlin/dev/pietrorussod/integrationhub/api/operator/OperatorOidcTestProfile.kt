package dev.pietrorussod.integrationhub.api.operator

import io.quarkus.test.junit.QuarkusTestProfile

class OperatorOidcTestProfile : QuarkusTestProfile {
    override fun getConfigOverrides(): Map<String, String> =
        mapOf(
            "quarkus.keycloak.devservices.enabled" to "false",
            "quarkus.oidc.tenant-enabled" to "true",
            "quarkus.oidc.auth-server-url" to "${'$'}{keycloak.url}/realms/quarkus",
            "quarkus.oidc.client-id" to AUDIENCE,
            "quarkus.oidc.token.audience" to AUDIENCE,
            "quarkus.oidc.token.issuer" to ISSUER,
            "quarkus.http.auth.permission.operator-api.enabled" to "true",
        )

    companion object {
        const val AUDIENCE = "integration-hub-operator-api"
        const val ISSUER = "https://server.example.com"
    }
}
