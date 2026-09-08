package dev.pietrorussod.integrationhub.application.search

import org.junit.jupiter.api.Assertions.assertDoesNotThrow
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant

class SearchOrdersQueryTest {
    @Test
    fun `accepts the complete supported result window`() {
        assertDoesNotThrow {
            query(limit = 100, offset = 9_900)
        }
    }

    @Test
    fun `rejects invalid text filters`() {
        listOf("", " ", " padded ", "x".repeat(201)).forEach { value ->
            assertThrows(IllegalArgumentException::class.java) {
                query(text = value)
            }
        }
    }

    @Test
    fun `rejects an invalid receipt interval`() {
        val from = Instant.parse("2026-09-07T08:00:00Z")

        assertThrows(IllegalArgumentException::class.java) {
            query(receivedAtFrom = from, receivedAtBefore = from)
        }
    }

    @Test
    fun `rejects invalid pagination`() {
        listOf(
            0 to 0,
            101 to 0,
            100 to -1,
            100 to 9_901,
        ).forEach { (limit, offset) ->
            assertThrows(IllegalArgumentException::class.java) {
                query(limit = limit, offset = offset)
            }
        }
    }

    private fun query(
        text: String? = null,
        receivedAtFrom: Instant? = null,
        receivedAtBefore: Instant? = null,
        limit: Int = 20,
        offset: Int = 0,
    ): SearchOrdersQuery =
        SearchOrdersQuery(
            text = text,
            sourceSystem = null,
            externalOrderId = null,
            status = null,
            currency = null,
            sku = null,
            receivedAtFrom = receivedAtFrom,
            receivedAtBefore = receivedAtBefore,
            limit = limit,
            offset = offset,
        )
}
