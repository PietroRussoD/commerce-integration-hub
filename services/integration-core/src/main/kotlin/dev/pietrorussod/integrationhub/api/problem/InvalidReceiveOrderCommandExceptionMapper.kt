package dev.pietrorussod.integrationhub.api.problem

import dev.pietrorussod.integrationhub.application.order.InvalidReceiveOrderCommandException
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.UriInfo
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider

@Provider
class InvalidReceiveOrderCommandExceptionMapper : ExceptionMapper<InvalidReceiveOrderCommandException> {
    @Context
    lateinit var uriInfo: UriInfo

    override fun toResponse(exception: InvalidReceiveOrderCommandException): Response =
        ProblemDetails(
            type = "urn:problem:invalid-order-request",
            title = "Invalid order request",
            status = Response.Status.BAD_REQUEST.statusCode,
            detail = "The order request violates a business rule.",
            instance = "/${uriInfo.path}",
            code = "INVALID_ORDER_REQUEST",
        ).toResponse()
}
