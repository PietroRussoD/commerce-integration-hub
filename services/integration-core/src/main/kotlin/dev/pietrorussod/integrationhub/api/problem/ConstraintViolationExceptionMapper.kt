package dev.pietrorussod.integrationhub.api.problem

import jakarta.validation.ConstraintViolationException
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.UriInfo
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider

@Provider
class ConstraintViolationExceptionMapper : ExceptionMapper<ConstraintViolationException> {
    @Context
    lateinit var uriInfo: UriInfo

    override fun toResponse(exception: ConstraintViolationException): Response =
        ProblemDetails(
            type = "urn:problem:request-validation",
            title = "Request validation failed",
            status = Response.Status.BAD_REQUEST.statusCode,
            detail = "One or more request fields are invalid.",
            instance = "/${uriInfo.path}",
            code = "REQUEST_VALIDATION_FAILED",
            errors =
                exception.constraintViolations
                    .map { violation ->
                        ProblemFieldError(
                            field = requestField(violation.propertyPath.toString()),
                            message = violation.message,
                        )
                    }.sortedBy { it.field },
        ).toResponse()

    private fun requestField(propertyPath: String): String =
        propertyPath.substringAfter(".request.", propertyPath.substringAfter("request.", propertyPath))
}
