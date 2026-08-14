package dev.pietrorussod.integrationhub.application.authentication

import dev.pietrorussod.integrationhub.domain.order.SourceSystem

sealed interface SourceAuthenticationResult {
    data class Authenticated(
        val sourceSystem: SourceSystem,
    ) : SourceAuthenticationResult

    data object Rejected : SourceAuthenticationResult
}
