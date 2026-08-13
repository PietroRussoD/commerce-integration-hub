package dev.pietrorussod.integrationhub.api.problem

import jakarta.ws.rs.NotSupportedException
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.UriInfo
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider

@Provider
class NotSupportedExceptionMapper : ExceptionMapper<NotSupportedException> {
    @Context
    lateinit var uriInfo: UriInfo

    override fun toResponse(exception: NotSupportedException): Response =
        ProblemDetails(
            type = "urn:problem:unsupported-media-type",
            title = "Unsupported media type",
            status = Response.Status.UNSUPPORTED_MEDIA_TYPE.statusCode,
            detail = "The request body must use application/json.",
            instance = "/${uriInfo.path}",
            code = "UNSUPPORTED_MEDIA_TYPE",
        ).toResponse()
}
