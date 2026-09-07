package dev.pietrorussod.integrationhub.infrastructure.search

import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.wait.strategy.Wait
import org.testcontainers.utility.DockerImageName
import java.time.Duration

class OpenSearchTestContainer : GenericContainer<OpenSearchTestContainer>(DockerImageName.parse("opensearchproject/opensearch:3.8.0")) {
    init {
        withEnv("discovery.type", "single-node")
        withEnv("DISABLE_SECURITY_PLUGIN", "true")
        withEnv("OPENSEARCH_JAVA_OPTS", "-Xms512m -Xmx512m")
        withExposedPorts(9200)
        waitingFor(Wait.forHttp("/").forStatusCode(200))
        withStartupTimeout(Duration.ofMinutes(2))
    }

    fun endpoint(): String = "http://$host:${getMappedPort(9200)}"
}
