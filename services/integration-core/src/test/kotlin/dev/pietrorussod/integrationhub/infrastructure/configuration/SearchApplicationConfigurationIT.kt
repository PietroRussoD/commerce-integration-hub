package dev.pietrorussod.integrationhub.infrastructure.configuration

import dev.pietrorussod.integrationhub.application.search.RunOrderSearchProjectionReconciliationUseCase
import dev.pietrorussod.integrationhub.application.search.RunOrderSearchReindexUseCase
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

@QuarkusTest
class SearchApplicationConfigurationIT {
    @Inject
    lateinit var runReindex: RunOrderSearchReindexUseCase

    @Inject
    lateinit var runReconciliation: RunOrderSearchProjectionReconciliationUseCase

    @Test
    fun `composes the search maintenance use cases`() {
        assertNotNull(runReindex)
        assertNotNull(runReconciliation)
    }
}
