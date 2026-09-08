package dev.pietrorussod.integrationhub.application.search

import java.time.Instant
import java.util.UUID

interface ReadyOrderSearchDocumentReader {
    fun readPage(
        after: ReadyOrderSearchDocumentCursor?,
        limit: Int,
    ): List<OrderSearchDocument>
}

data class ReadyOrderSearchDocumentCursor(
    val receivedAt: Instant,
    val orderId: UUID,
)
