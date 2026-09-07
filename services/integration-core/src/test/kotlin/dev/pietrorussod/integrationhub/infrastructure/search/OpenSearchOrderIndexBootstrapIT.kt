package dev.pietrorussod.integrationhub.infrastructure.search

import org.apache.hc.core5.http.HttpHost
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.transport.httpclient5.ApacheHttpClient5TransportBuilder
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.time.Duration

@Testcontainers
class OpenSearchOrderIndexBootstrapIT {
    @Test
    fun `creates the versioned index and keeps alias initialization idempotent`() {
        val transport =
            ApacheHttpClient5TransportBuilder
                .builder(HttpHost("http", openSearch.host, openSearch.getMappedPort(9200)))
                .build()
        val client = OpenSearchClient(transport)

        try {
            val bootstrap = OpenSearchOrderIndexBootstrap(client)

            assertEquals(OpenSearchOrderIndexBootstrapOutcome.CREATED, bootstrap.ensureReadAlias())
            assertTrue(
                client
                    .indices()
                    .existsAlias { request -> request.name(OpenSearchOrderIndexDefinition.READ_ALIAS) }
                    .value(),
            )
            assertEquals(OpenSearchOrderIndexBootstrapOutcome.ALREADY_EXISTS, bootstrap.ensureReadAlias())
        } finally {
            transport.close()
        }
    }

    private companion object {
        @Container
        @JvmField
        val openSearch: OpenSearchContainer =
            OpenSearchContainer()
                .withEnv("discovery.type", "single-node")
                .withEnv("DISABLE_SECURITY_PLUGIN", "true")
                .withEnv("OPENSEARCH_JAVA_OPTS", "-Xms512m -Xmx512m")
                .withExposedPorts(9200)
                .waitingFor(Wait.forHttp("/").forStatusCode(200))
                .withStartupTimeout(Duration.ofMinutes(2))
    }

    private class OpenSearchContainer :
        GenericContainer<OpenSearchContainer>(DockerImageName.parse("opensearchproject/opensearch:3.8.0"))
}
