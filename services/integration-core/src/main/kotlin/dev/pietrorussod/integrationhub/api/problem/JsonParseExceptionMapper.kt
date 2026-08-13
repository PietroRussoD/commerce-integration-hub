package dev.pietrorussod.integrationhub.api.problem

import com.fasterxml.jackson.core.JsonParseException
import jakarta.annotation.Priority
import jakarta.ws.rs.Priorities
import jakarta.ws.rs.WebApplicationException
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.UriInfo
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider
import org.jboss.resteasy.reactive.server.ExceptionUnwrapStrategy
import org.jboss.resteasy.reactive.server.UnwrapException

@Provider
@Priority(Priorities.USER)
@UnwrapException(
    value = [WebApplicationException::class],
    strategy = ExceptionUnwrapStrategy.UNWRAP_IF_NO_EXACT_MATCH,
)
class JsonParseExceptionMapper : ExceptionMapper<JsonParseException> {
    @Context
    lateinit var uriInfo: UriInfo

    override fun toResponse(exception: JsonParseException): Response = invalidJsonBody("/${uriInfo.path}")
}
