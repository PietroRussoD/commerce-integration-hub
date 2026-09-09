package dev.pietrorussod.integrationhub.application.search

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ValidateOrderSearchReindexUseCaseTest {
    @Test
    fun `accepts a candidate with the authoritative document count`() {
        val useCase =
            ValidateOrderSearchReindexUseCase(
                authoritativeDocumentCounter = { 3L },
                candidateDocumentCounter = { candidateIndex ->
                    assertEquals("orders-v2", candidateIndex)
                    3L
                },
            )

        val result = useCase.validate("orders-v2")

        assertTrue(result.isValid)
    }

    @Test
    fun `rejects a candidate with a different document count`() {
        val useCase =
            ValidateOrderSearchReindexUseCase(
                authoritativeDocumentCounter = { 3L },
                candidateDocumentCounter = { 2L },
            )

        val result = useCase.validate("orders-v2")

        assertFalse(result.isValid)
    }
}
