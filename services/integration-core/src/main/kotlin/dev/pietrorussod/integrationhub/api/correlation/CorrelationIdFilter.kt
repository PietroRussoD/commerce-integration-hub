package dev.pietrorussod.integrationhub.api.correlation

import jakarta.annotation.Priority
import jakarta.ws.rs.Priorities
import jakarta.ws.rs.container.ContainerRequestContext
import jakarta.ws.rs.container.ContainerRequestFilter
import jakarta.ws.rs.container.ContainerResponseContext
import jakarta.ws.rs.container.ContainerResponseFilter
import jakarta.ws.rs.container.PreMatching
import jakarta.ws.rs.ext.Provider
import org.jboss.logging.Logger
import org.jboss.logmanager.MDC
import java.util.UUID

@Provider
@PreMatching
@Priority(Priorities.AUTHENTICATION - 100)
class CorrelationIdFilter :
    ContainerRequestFilter,
    ContainerResponseFilter {
    override fun filter(requestContext: ContainerRequestContext) {
        val correlationId = parse(requestContext.getHeaderString(CORRELATION_ID_HEADER)) ?: UUID.randomUUID()
        requestContext.setProperty(CORRELATION_ID_PROPERTY, correlationId)
        requestContext.setProperty(REQUEST_STARTED_AT_PROPERTY, System.nanoTime())
        MDC.put(CORRELATION_ID_MDC_KEY, correlationId.toString())
    }

    override fun filter(
        requestContext: ContainerRequestContext,
        responseContext: ContainerResponseContext,
    ) {
        val correlationId =
            requestContext.correlationIdOrNull()
                ?: (parse(requestContext.getHeaderString(CORRELATION_ID_HEADER)) ?: UUID.randomUUID())
        responseContext.headers.putSingle(CORRELATION_ID_HEADER, correlationId.toString())

        try {
            val durationMillis = requestContext.elapsedMillis()
            MDC.put(CORRELATION_ID_MDC_KEY, correlationId.toString())
            MDC.put(HTTP_METHOD_MDC_KEY, requestContext.method)
            MDC.put(HTTP_PATH_MDC_KEY, requestContext.uriInfo.path)
            MDC.put(HTTP_STATUS_MDC_KEY, responseContext.status.toString())
            durationMillis?.let { MDC.put(DURATION_MILLIS_MDC_KEY, it.toString()) }

            logger.info("HTTP request completed")
        } finally {
            MDC.remove(DURATION_MILLIS_MDC_KEY)
            MDC.remove(HTTP_STATUS_MDC_KEY)
            MDC.remove(HTTP_PATH_MDC_KEY)
            MDC.remove(HTTP_METHOD_MDC_KEY)
            MDC.remove(CORRELATION_ID_MDC_KEY)
        }
    }

    private fun parse(value: String?): UUID? {
        if (value == null || value != value.trim()) {
            return null
        }

        return runCatching { UUID.fromString(value) }
            .getOrNull()
            ?.takeIf { it.toString().equals(value, ignoreCase = true) }
    }

    private fun ContainerRequestContext.elapsedMillis(): Long? =
        (getProperty(REQUEST_STARTED_AT_PROPERTY) as? Long)?.let { startedAt ->
            (System.nanoTime() - startedAt) / NANOS_PER_MILLISECOND
        }

    private companion object {
        val logger: Logger = Logger.getLogger(CorrelationIdFilter::class.java)
        const val REQUEST_STARTED_AT_PROPERTY = "integration-hub.request-started-at"
        const val NANOS_PER_MILLISECOND = 1_000_000L
    }
}

fun ContainerRequestContext.correlationId(): UUID =
    requireNotNull(correlationIdOrNull()) {
        "Correlation ID has not been initialized"
    }

private fun ContainerRequestContext.correlationIdOrNull(): UUID? = getProperty(CORRELATION_ID_PROPERTY) as? UUID

const val CORRELATION_ID_HEADER = "X-Correlation-ID"
const val CORRELATION_ID_MDC_KEY = "correlationId"

private const val CORRELATION_ID_PROPERTY = "integration-hub.correlation-id"
private const val HTTP_METHOD_MDC_KEY = "httpMethod"
private const val HTTP_PATH_MDC_KEY = "httpPath"
private const val HTTP_STATUS_MDC_KEY = "httpStatus"
private const val DURATION_MILLIS_MDC_KEY = "durationMs"
