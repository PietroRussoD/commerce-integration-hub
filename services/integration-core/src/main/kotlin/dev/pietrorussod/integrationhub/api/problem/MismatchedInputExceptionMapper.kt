package dev.pietrorussod.integrationhub.api.problem

import com.fasterxml.jackson.databind.exc.MismatchedInputException
import jakarta.annotation.Priority
import jakarta.ws.rs.Priorities
import jakarta.ws.rs.core.Context
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.UriInfo
import jakarta.ws.rs.ext.ExceptionMapper
import jakarta.ws.rs.ext.Provider

@Provider
@Priority(Priorities.USER)
class MismatchedInputExceptionMapper : ExceptionMapper<MismatchedInputException> {
    @Context
    lateinit var uriInfo: UriInfo

    override fun toResponse(exception: MismatchedInputException): Response = invalidJsonBody("/${uriInfo.path}")
}
