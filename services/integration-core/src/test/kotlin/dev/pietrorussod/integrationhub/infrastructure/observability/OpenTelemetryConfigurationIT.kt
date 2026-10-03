package dev.pietrorussod.integrationhub.infrastructure.observability

import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter
import io.quarkus.test.junit.QuarkusTest
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import jakarta.inject.Singleton
import jakarta.ws.rs.Produces
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

@ApplicationScoped
class InMemorySpanExporterProducer {
    @Produces
    @Singleton
    fun inMemorySpanExporter(): InMemorySpanExporter = InMemorySpanExporter.create()
}

@QuarkusTest
class OpenTelemetryConfigurationIT {
    @Inject
    lateinit var openTelemetry: OpenTelemetry

    @Inject
    lateinit var inMemorySpanExporter: InMemorySpanExporter

    @ConfigProperty(name = "quarkus.otel.sdk.disabled")
    lateinit var sdkDisabled: String

    @Test
    fun `does not export spans when the SDK is disabled`() {
        assertEquals("true", sdkDisabled)

        val span = openTelemetry.getTracer("integration-core-test").spanBuilder("sdk-disabled-check").startSpan()
        span.end()

        assertEquals(0, inMemorySpanExporter.finishedSpanItems.size)
    }
}
