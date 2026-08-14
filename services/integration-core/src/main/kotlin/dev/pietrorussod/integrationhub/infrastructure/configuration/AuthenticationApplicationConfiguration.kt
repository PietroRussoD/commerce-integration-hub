package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.authentication.AuthenticateSourceUseCase
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialRepository
import dev.pietrorussod.integrationhub.application.authentication.SourceCredentialSecretVerifier
import dev.pietrorussod.integrationhub.infrastructure.security.HmacSha256SourceCredentialSecretVerifier
import dev.pietrorussod.integrationhub.infrastructure.security.SourceCredentialPepperProvider
import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock

class AuthenticationApplicationConfiguration {
    @Produces
    @ApplicationScoped
    fun sourceCredentialSecretVerifier(pepperProvider: SourceCredentialPepperProvider): SourceCredentialSecretVerifier =
        HmacSha256SourceCredentialSecretVerifier(pepperProvider)

    @Produces
    @ApplicationScoped
    fun authenticateSourceUseCase(
        credentialRepository: SourceCredentialRepository,
        secretVerifier: SourceCredentialSecretVerifier,
    ): AuthenticateSourceUseCase =
        AuthenticateSourceUseCase(
            credentialRepository = credentialRepository,
            secretVerifier = secretVerifier,
            clock = Clock.systemUTC(),
        )
}
