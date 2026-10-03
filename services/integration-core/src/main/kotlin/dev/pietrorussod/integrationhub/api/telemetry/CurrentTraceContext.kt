package dev.pietrorussod.integrationhub.api.telemetry

import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.Context

object CurrentTraceContext {
    fun capture(): TraceContext? {
        val values = mutableMapOf<String, String>()
        W3CTraceContextPropagator
            .getInstance()
            .inject(Context.current(), values, MapSetter)

        val traceparent = values[TRACEPARENT_HEADER] ?: return null
        return TraceContext(
            traceparent = traceparent,
            tracestate = values[TRACESTATE_HEADER],
        )
    }

    private object MapSetter : io.opentelemetry.context.propagation.TextMapSetter<MutableMap<String, String>> {
        override fun set(
            carrier: MutableMap<String, String>?,
            key: String,
            value: String,
        ) {
            carrier?.set(key, value)
        }
    }

    private const val TRACEPARENT_HEADER = "traceparent"
    private const val TRACESTATE_HEADER = "tracestate"
}
