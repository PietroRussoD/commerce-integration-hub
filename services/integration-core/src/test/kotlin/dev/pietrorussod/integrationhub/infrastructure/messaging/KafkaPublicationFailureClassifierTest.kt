package dev.pietrorussod.integrationhub.infrastructure.messaging

import dev.pietrorussod.integrationhub.application.outbox.PublicationFailureKind
import dev.pietrorussod.integrationhub.application.outbox.PublicationOutcome
import io.smallrye.mutiny.TimeoutException
import org.apache.kafka.common.errors.SerializationException
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class KafkaPublicationFailureClassifierTest {
    @Test
    fun `classifies serialization failures as non-retryable`() {
        val exception = RuntimeException("Kafka send failed", SerializationException("Invalid event"))

        val result = KafkaPublicationFailureClassifier.classify(exception)

        assertEquals(
            PublicationOutcome.Failed(
                kind = PublicationFailureKind.NON_RETRYABLE,
                errorCode = "KAFKA_SERIALIZATION_FAILED",
                safeErrorMessage = "Outbound event could not be serialized",
            ),
            result,
        )
    }

    @Test
    fun `classifies acknowledgement timeouts as retryable`() {
        val result = KafkaPublicationFailureClassifier.classify(TimeoutException())

        assertEquals(
            PublicationOutcome.Failed(
                kind = PublicationFailureKind.RETRYABLE,
                errorCode = "KAFKA_PUBLISH_FAILED",
                safeErrorMessage = "Kafka did not acknowledge the event in time",
            ),
            result,
        )
    }

    @Test
    fun `classifies other publication failures as retryable`() {
        val result = KafkaPublicationFailureClassifier.classify(IllegalStateException("Broker unavailable"))

        assertEquals(
            PublicationOutcome.Failed(
                kind = PublicationFailureKind.RETRYABLE,
                errorCode = "KAFKA_PUBLISH_FAILED",
                safeErrorMessage = "Kafka did not acknowledge the outbound event",
            ),
            result,
        )
    }
}
