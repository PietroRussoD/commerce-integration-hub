package dev.pietrorussod.integrationhub.api.problem

import jakarta.ws.rs.core.Response

fun invalidJsonBody(instance: String): Response =
    ProblemDetails(
        type = "urn:problem:invalid-json-body",
        title = "Invalid JSON body",
        status = Response.Status.BAD_REQUEST.statusCode,
        detail = "The request body must be valid JSON matching the expected schema.",
        instance = instance,
        code = "INVALID_JSON_BODY",
    ).toResponse()
