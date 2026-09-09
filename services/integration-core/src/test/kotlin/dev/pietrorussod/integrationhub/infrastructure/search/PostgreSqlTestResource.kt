package dev.pietrorussod.integrationhub.infrastructure.search

import io.quarkus.test.common.QuarkusTestResourceLifecycleManager
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.DockerImageName
import java.time.Duration

private const val DATABASE = "order_search_reindex_test"
private const val USERNAME = "integration_hub"
private const val PASSWORD = "integration_hub"

class PostgreSqlTestResource : QuarkusTestResourceLifecycleManager {
    private lateinit var database: PostgreSqlTestContainer

    override fun start(): Map<String, String> {
        database = PostgreSqlTestContainer()
        database.start()

        return mapOf(
            "quarkus.datasource.devservices.enabled" to "false",
            "quarkus.datasource.jdbc.url" to database.jdbcUrl(),
            "quarkus.datasource.username" to USERNAME,
            "quarkus.datasource.password" to PASSWORD,
        )
    }

    override fun stop() {
        if (::database.isInitialized) {
            database.stop()
        }
    }
}

private class PostgreSqlTestContainer :
    GenericContainer<PostgreSqlTestContainer>(DockerImageName.parse("postgres:18.3")) {
    init {
        withEnv("POSTGRES_DB", DATABASE)
        withEnv("POSTGRES_USER", USERNAME)
        withEnv("POSTGRES_PASSWORD", PASSWORD)
        withExposedPorts(5432)
        waitingFor(Wait.forListeningPort())
        withStartupTimeout(Duration.ofMinutes(2))
    }

    fun jdbcUrl(): String = "jdbc:postgresql://$host:${getMappedPort(5432)}/$DATABASE"
}
