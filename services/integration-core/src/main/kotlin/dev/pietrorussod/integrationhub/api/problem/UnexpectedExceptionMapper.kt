package dev.pietrorussod.integrationhub.api.problem

import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.UriInfo
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider

@Provider
class UnexpectedExceptionMapper : ExceptionMapper<Exception> {
    @Context
    lateinit var uriInfo: UriInfo

    override fun toResponse(exception: Exception): Response =
        ProblemDetails(
            type = "urn:problem:internal-server-error",
            title = "Internal server error",
            status = Response.Status.INTERNAL_SERVER_ERROR.statusCode,
            detail = "The request could not be completed.",
            instance = "/${uriInfo.path.trimStart('/')}",
            code = "INTERNAL_SERVER_ERROR",
        ).toResponse()
}
