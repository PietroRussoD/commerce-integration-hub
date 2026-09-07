package dev.pietrorussod.integrationhub.infrastructure.search

import dev.pietrorussod.integrationhub.application.search.OrderSearchDocument
import dev.pietrorussod.integrationhub.application.search.OrderSearchItem
import dev.pietrorussod.integrationhub.application.search.OrderSearchProjectionWriteOutcome
import dev.pietrorussod.integrationhub.domain.order.Currency
import dev.pietrorussod.integrationhub.domain.order.OrderStatus
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import org.apache.hc.core5.http.HttpHost
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.opensearch.client.json.JsonData
import org.opensearch.client.opensearch.OpenSearchClient
import org.opensearch.client.transport.httpclient5.ApacheHttpClient5TransportBuilder
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.math.BigDecimal
import java.time.Duration
import java.time.Instant
import java.util.UUID

@Testcontainers
class OpenSearchOrderProjectionIT {
    @Test
    fun `creates the versioned index and keeps alias initialization idempotent`() {
        withClient { client ->
            val bootstrap = OpenSearchOrderIndexBootstrap(client)

            bootstrap.ensureReadAlias()
            assertTrue(
                client
                    .indices()
                    .existsAlias { request -> request.name(OpenSearchOrderIndexDefinition.READ_ALIAS) }
                    .value(),
            )
            assertEquals(OpenSearchOrderIndexBootstrapOutcome.ALREADY_EXISTS, bootstrap.ensureReadAlias())
        }
    }

    @Test
    fun `keeps the newest order aggregate version`() {
        withClient { client ->
            val projection =
                OpenSearchOrderSearchProjection(
                    client,
                    OpenSearchOrderIndexBootstrap(client),
                )
            val orderId = UUID.randomUUID()

            assertEquals(
                OrderSearchProjectionWriteOutcome.APPLIED,
                projection.upsert(searchDocument(orderId, aggregateVersion = 3, externalOrderId = "ORDER-3")),
            )
            assertEquals(
                OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION,
                projection.upsert(searchDocument(orderId, aggregateVersion = 3, externalOrderId = "DUPLICATE")),
            )
            assertEquals(
                OrderSearchProjectionWriteOutcome.IGNORED_NON_NEWER_VERSION,
                projection.upsert(searchDocument(orderId, aggregateVersion = 2, externalOrderId = "STALE")),
            )

            val stored =
                client.get(
                    { request ->
                        request
                            .index(OpenSearchOrderIndexDefinition.READ_ALIAS)
                            .id(orderId.toString())
                    },
                    JsonData::class.java,
                )

            assertTrue(stored.found())
            val storedSource = requireNotNull(stored.source()).toJson().asJsonObject()
            assertEquals(
                3,
                storedSource.getInt("aggregateVersion"),
            )
            assertEquals(
                "ORDER-3",
                storedSource.getString("externalOrderId"),
            )
        }
    }

    private fun withClient(block: (OpenSearchClient) -> Unit) {
        val transport =
            ApacheHttpClient5TransportBuilder
                .builder(HttpHost("http", openSearch.host, openSearch.getMappedPort(9200)))
                .build()
        try {
            block(OpenSearchClient(transport))
        } finally {
            transport.close()
        }
    }

    private fun searchDocument(
        orderId: UUID,
        aggregateVersion: Long,
        externalOrderId: String,
    ): OrderSearchDocument =
        OrderSearchDocument(
            orderId = orderId,
            aggregateVersion = aggregateVersion,
            sourceSystem = SourceSystem.from("MARKETPLACE_A"),
            externalOrderId = externalOrderId,
            status = OrderStatus.READY,
            currency = Currency.EUR,
            totalAmount = BigDecimal("39.98"),
            receivedAt = Instant.parse("2026-09-07T08:00:00Z"),
            readyAt = Instant.parse("2026-09-07T08:01:00Z"),
            items =
                listOf(
                    OrderSearchItem(
                        sku = "SKU-1",
                        description = "Searchable item",
                        quantity = BigDecimal("2"),
                        unitPrice = BigDecimal("19.99"),
                        lineAmount = BigDecimal("39.98"),
                        position = 0,
                    ),
                ),
        )

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
