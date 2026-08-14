package dev.pietrorussod.integrationhub.api.correlation

import jakarta.annotation.Priority
import jakarta.ws.rs.Priorities
import jakarta.ws.rs.container.ContainerRequestContext
import jakarta.ws.rs.container.ContainerRequestFilter
import jakarta.ws.rs.container.ContainerResponseContext
import jakarta.ws.rs.container.ContainerResponseFilter
import jakarta.ws.rs.ext.Provider
import java.util.UUID

@Provider
@Priority(Priorities.AUTHENTICATION - 100)
class CorrelationIdFilter :
    ContainerRequestFilter,
    ContainerResponseFilter {
    override fun filter(requestContext: ContainerRequestContext) {
        val correlationId = parse(requestContext.getHeaderString(CORRELATION_ID_HEADER)) ?: UUID.randomUUID()
        requestContext.setProperty(CORRELATION_ID_PROPERTY, correlationId)
    }

    override fun filter(
        requestContext: ContainerRequestContext,
        responseContext: ContainerResponseContext,
    ) {
        val correlationId =
            requestContext.correlationIdOrNull()
                ?: (parse(requestContext.getHeaderString(CORRELATION_ID_HEADER)) ?: UUID.randomUUID())
        responseContext.headers.putSingle(CORRELATION_ID_HEADER, correlationId.toString())
    }

    private fun parse(value: String?): UUID? {
        if (value == null || value != value.trim()) {
            return null
        }

        return runCatching { UUID.fromString(value) }
            .getOrNull()
            ?.takeIf { it.toString().equals(value, ignoreCase = true) }
    }
}

fun ContainerRequestContext.correlationId(): UUID =
    requireNotNull(correlationIdOrNull()) {
        "Correlation ID has not been initialized"
    }

private fun ContainerRequestContext.correlationIdOrNull(): UUID? = getProperty(CORRELATION_ID_PROPERTY) as? UUID

const val CORRELATION_ID_HEADER = "X-Correlation-ID"

private const val CORRELATION_ID_PROPERTY = "integration-hub.correlation-id"
