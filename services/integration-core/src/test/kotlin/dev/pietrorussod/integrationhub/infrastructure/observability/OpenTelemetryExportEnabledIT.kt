package dev.pietrorussod.integrationhub.infrastructure.observability

import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.sdk.testing.exporter.InMemorySpanExporter
import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import jakarta.inject.Inject
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

@QuarkusTest
@TestProfile(OpenTelemetryExportEnabledTestProfile::class)
class OpenTelemetryExportEnabledIT {
    @Inject
    lateinit var openTelemetry: OpenTelemetry

    @Inject
    lateinit var inMemorySpanExporter: InMemorySpanExporter

    @ConfigProperty(name = "quarkus.otel.sdk.disabled")
    lateinit var sdkDisabled: String

    @ConfigProperty(name = "quarkus.otel.traces.exporter")
    lateinit var exporterMode: String

    @Test
    fun `exports a finished span to the configured exporter`() {
        assertEquals("false", sdkDisabled)
        assertEquals("cdi", exporterMode)
        inMemorySpanExporter.reset()

        val span = openTelemetry.getTracer("integration-core-test").spanBuilder("sdk-enabled-check").startSpan()
        assertTrue(span.isRecording)
        span.end()

        repeat(100) {
            if (inMemorySpanExporter.finishedSpanItems.any { it.name == "sdk-enabled-check" }) return
            Thread.sleep(10)
        }

        assertEquals(1, inMemorySpanExporter.finishedSpanItems.count { it.name == "sdk-enabled-check" })
    }
}

class OpenTelemetryExportEnabledTestProfile : QuarkusTestProfile {
    override fun getConfigOverrides(): Map<String, String> =
        mapOf(
            "quarkus.otel.sdk.disabled" to "false",
            "quarkus.otel.traces.exporter" to "cdi",
            "quarkus.otel.bsp.schedule.delay" to "10ms",
        )
}
