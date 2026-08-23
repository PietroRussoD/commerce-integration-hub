package dev.pietrorussod.integrationhub.application.operator

data class OperatorOrderPage(
    val items: List<OperatorOrderSummary>,
    val limit: Int,
    val offset: Int,
    val total: Long,
)
