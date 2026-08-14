package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.authentication.AuthenticateSourceUseCase
import dev.pietrorussod.integrationhub.application.authentication.SourceAuthenticationResult
import dev.pietrorussod.integrationhub.infrastructure.security.SourceCredentialPepperProvider
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test

@QuarkusTest
class AuthenticationApplicationConfigurationIT {
    @Inject
    lateinit var authenticateSourceUseCase: AuthenticateSourceUseCase

    @Inject
    lateinit var pepperProvider: SourceCredentialPepperProvider

    @Test
    fun `composes authentication without requiring a development pepper`() {
        assertEquals(SourceAuthenticationResult.Rejected, authenticateSourceUseCase.authenticate(null))
        assertNull(pepperProvider.findByVersion(1))
    }
}
