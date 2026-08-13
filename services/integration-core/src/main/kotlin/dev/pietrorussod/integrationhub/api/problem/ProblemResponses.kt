package dev.pietrorussod.integrationhub.api.problem

import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response

const val PROBLEM_JSON = "application/problem+json"

fun ProblemDetails.toResponse(): Response =
    Response
        .status(status)
        .type(MediaType.valueOf(PROBLEM_JSON))
        .entity(this)
        .build()
