package dev.pietrorussod.integrationhub.application.outbox

import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID

class OutboundIntegrationEventTest {
    @Test
    fun `maps stable event data without claim metadata`() {
        val traceContext =
            TraceContext(
                traceparent = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
                tracestate = "vendor=value",
            )
        val claimedEvent =
            ClaimedOutboxEvent(
                id = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f61"),
                claimId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f70"),
                workerId = "publisher-1",
                aggregateType = "ORDER",
                aggregateId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f52"),
                eventType = "OrderReceived",
                eventVersion = 1,
                payload = "{\"orderId\":\"018f38c2-1b95-7cc4-bb89-72d26a6f9f52\"}",
                correlationId = UUID.fromString("018f38c2-1b95-7cc4-bb89-72d26a6f9f55"),
                createdAt = Instant.parse("2026-08-19T08:00:00Z"),
                publishAttempts = 3,
                traceContext = traceContext,
            )

        val outboundEvent = claimedEvent.toOutboundIntegrationEvent()

        assertEquals(1, outboundEvent.envelopeVersion)
        assertEquals(claimedEvent.id, outboundEvent.eventId)
        assertEquals(claimedEvent.eventType, outboundEvent.eventType)
        assertEquals(claimedEvent.eventVersion, outboundEvent.eventVersion)
        assertEquals(claimedEvent.aggregateType, outboundEvent.aggregateType)
        assertEquals(claimedEvent.aggregateId, outboundEvent.aggregateId)
        assertEquals(claimedEvent.correlationId, outboundEvent.correlationId)
        assertEquals(claimedEvent.createdAt, outboundEvent.occurredAt)
        assertEquals(claimedEvent.payload, outboundEvent.payload)
        assertEquals(traceContext, outboundEvent.traceContext)
    }

    @Test
    fun `rejects unsafe publication failure details`() {
        assertThrows(IllegalArgumentException::class.java) {
            PublicationOutcome.Failed(
                kind = PublicationFailureKind.NON_RETRYABLE,
                errorCode = "invalid-code",
                safeErrorMessage = "Event payload cannot be published",
            )
        }
        assertThrows(IllegalArgumentException::class.java) {
            PublicationOutcome.Failed(
                kind = PublicationFailureKind.NON_RETRYABLE,
                errorCode = "INVALID_EVENT_PAYLOAD",
                safeErrorMessage = " ",
            )
        }
    }
}
