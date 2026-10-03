package dev.pietrorussod.integrationhub.infrastructure.telemetry

import io.opentelemetry.api.trace.Span
import io.opentelemetry.api.trace.SpanContext
import io.opentelemetry.api.trace.TraceFlags
import io.opentelemetry.api.trace.TraceState
import io.opentelemetry.context.Context
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

class CurrentTraceContextTest {
    @Test
    fun `captures W3C context from the active span`() {
        val spanContext =
            SpanContext.create(
                "0123456789abcdef0123456789abcdef",
                "0123456789abcdef",
                TraceFlags.getSampled(),
                TraceState.builder().put("vendor", "value").build(),
            )

        val scope = Context.current().with(Span.wrap(spanContext)).makeCurrent()
        try {
            val traceContext = CurrentTraceContext.capture()

            assertEquals(
                "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
                traceContext?.traceparent,
            )
            assertEquals("vendor=value", traceContext?.tracestate)
        } finally {
            scope.close()
        }
    }

    @Test
    fun `returns no context when no valid span is active`() {
        assertNull(CurrentTraceContext.capture())
    }
}
