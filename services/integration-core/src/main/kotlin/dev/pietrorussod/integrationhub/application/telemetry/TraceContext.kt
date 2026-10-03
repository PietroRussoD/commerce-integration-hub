package dev.pietrorussod.integrationhub.application.telemetry

data class TraceContext(
    val traceparent: String,
    val tracestate: String?,
)
