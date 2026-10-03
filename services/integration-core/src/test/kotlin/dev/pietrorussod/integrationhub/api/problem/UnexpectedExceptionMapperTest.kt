package dev.pietrorussod.integrationhub.api.problem

import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.UriInfo
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`

class UnexpectedExceptionMapperTest {
    @Test
    fun `returns a generic server error without exposing exception details`() {
        val uriInfo = mock(UriInfo::class.java)
        `when`(uriInfo.path).thenReturn("/api/v1/orders")
        val mapper = UnexpectedExceptionMapper().apply { this.uriInfo = uriInfo }

        val response = mapper.toResponse(IllegalStateException("database password leaked"))

        assertEquals(Response.Status.INTERNAL_SERVER_ERROR.statusCode, response.status)
        assertEquals(
            ProblemDetails(
                type = "urn:problem:internal-server-error",
                title = "Internal server error",
                status = Response.Status.INTERNAL_SERVER_ERROR.statusCode,
                detail = "The request could not be completed.",
                instance = "/api/v1/orders",
                code = "INTERNAL_SERVER_ERROR",
            ),
            response.entity,
        )
    }
}
