package dev.pietrorussod.integrationhub.api.problem

data class ProblemDetails(
    val type: String,
    val title: String,
    val status: Int,
    val detail: String,
    val instance: String,
    val code: String,
    val errors: List<ProblemFieldError> = emptyList(),
)

data class ProblemFieldError(
    val field: String,
    val message: String,
)
