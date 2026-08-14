package dev.pietrorussod.integrationhub.api.security

import dev.pietrorussod.integrationhub.api.problem.PROBLEM_JSON
import dev.pietrorussod.integrationhub.api.problem.ProblemDetails
import dev.pietrorussod.integrationhub.application.authentication.AuthenticateSourceUseCase
import dev.pietrorussod.integrationhub.application.authentication.SourceAuthenticationResult
import dev.pietrorussod.integrationhub.domain.order.SourceSystem
import jakarta.annotation.Priority
import jakarta.inject.Inject
import jakarta.ws.rs.Priorities
import jakarta.ws.rs.container.ContainerRequestContext
import jakarta.ws.rs.container.ContainerRequestFilter
import jakarta.ws.rs.core.HttpHeaders
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.core.SecurityContext
import jakarta.ws.rs.ext.Provider
import java.security.Principal

@Provider
@SourceAuthenticated
@Priority(Priorities.AUTHENTICATION)
class SourceApiKeyAuthenticationFilter
    @Inject
    constructor(
        private val authenticateSourceUseCase: AuthenticateSourceUseCase,
    ) : ContainerRequestFilter {
        override fun filter(requestContext: ContainerRequestContext) {
            when (val result = authenticateSourceUseCase.authenticate(requestContext.getHeaderString(SOURCE_API_KEY_HEADER))) {
                is SourceAuthenticationResult.Authenticated -> {
                    requestContext.securityContext =
                        SourceSecurityContext(requestContext.securityContext, result.sourceSystem)
                }

                SourceAuthenticationResult.Rejected -> {
                    requestContext.abortWith(unauthorized(requestContext))
                }
            }
        }

        private fun unauthorized(requestContext: ContainerRequestContext): Response =
            Response
                .status(Response.Status.UNAUTHORIZED)
                .header(HttpHeaders.WWW_AUTHENTICATE, AUTHENTICATION_SCHEME)
                .type(PROBLEM_JSON)
                .entity(
                    ProblemDetails(
                        type = "urn:problem:source-authentication",
                        title = "Authentication required",
                        status = Response.Status.UNAUTHORIZED.statusCode,
                        detail = "A valid source API key is required.",
                        instance = requestContext.uriInfo.requestUri.path,
                        code = "SOURCE_AUTHENTICATION_REQUIRED",
                    ),
                ).build()

        private class SourceSecurityContext(
            private val delegate: SecurityContext,
            sourceSystem: SourceSystem,
        ) : SecurityContext {
            private val principal = Principal { sourceSystem.value }

            override fun getUserPrincipal(): Principal = principal

            override fun isUserInRole(role: String?): Boolean = false

            override fun isSecure(): Boolean = delegate.isSecure

            override fun getAuthenticationScheme(): String = AUTHENTICATION_SCHEME
        }

        private companion object {
            const val AUTHENTICATION_SCHEME = "SourceApiKey"
        }
    }
