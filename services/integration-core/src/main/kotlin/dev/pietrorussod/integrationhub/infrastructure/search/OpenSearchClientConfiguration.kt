package dev.pietrorussod.integrationhub.infrastructure.search

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Disposes
import jakarta.enterprise.inject.Produces
import jakarta.inject.Singleton
import org.apache.hc.core5.http.HttpHost
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.transport.httpclient5.ApacheHttpClient5Transport
import org.opensearch.client.transport.httpclient5.ApacheHttpClient5TransportBuilder
import java.net.URI

@ApplicationScoped
class OpenSearchClientConfiguration {
    @Produces
    @Singleton
    fun transport(
        @ConfigProperty(name = "integration-hub.opensearch.url") url: String,
    ): ApacheHttpClient5Transport {
        val endpoint = endpointFor(url)
        return ApacheHttpClient5TransportBuilder.builder(endpoint).build()
    }

    @Produces
    @Singleton
    fun openSearchClient(transport: ApacheHttpClient5Transport): OpenSearchClient = OpenSearchClient(transport)

    fun close(
        @Disposes transport: ApacheHttpClient5Transport,
    ) {
        transport.close()
    }

    private fun endpointFor(url: String): HttpHost {
        val endpoint = URI.create(url)
        require(endpoint.scheme in SUPPORTED_SCHEMES) {
            "OpenSearch URL must use http or https"
        }
        require(!endpoint.host.isNullOrBlank()) {
            "OpenSearch URL must include a host"
        }
        require(endpoint.port != -1) {
            "OpenSearch URL must include an explicit port"
        }
        require(endpoint.path.isEmpty() || endpoint.path == "/") {
            "OpenSearch URL must not include a path"
        }
        return HttpHost(endpoint.scheme, endpoint.host, endpoint.port)
    }

    private companion object {
        val SUPPORTED_SCHEMES = setOf("http", "https")
    }
}
