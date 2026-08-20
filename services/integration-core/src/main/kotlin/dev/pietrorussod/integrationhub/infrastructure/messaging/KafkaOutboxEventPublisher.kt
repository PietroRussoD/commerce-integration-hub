package dev.pietrorussod.integrationhub.infrastructure.messaging

import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventPublisher
import dev.pietrorussod.integrationhub.application.outbox.PublicationFailureKind
import dev.pietrorussod.integrationhub.application.outbox.PublicationOutcome
import io.smallrye.mutiny.TimeoutException
import io.smallrye.reactive.messaging.MutinyEmitter
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.apache.kafka.common.errors.SerializationException
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.reactive.messaging.Channel
import org.eclipse.microprofile.reactive.messaging.Message
import java.time.Duration

@ApplicationScoped
class KafkaOutboxEventPublisher
    @Inject
    constructor(
        private val eventMapper: StructuredEventMapper,
        private val metadataMapper: StructuredEventKafkaMetadataMapper,
        @param:Channel(CHANNEL_NAME) private val emitter: MutinyEmitter<StructuredEvent>,
        @param:ConfigProperty(name = "integration-hub.kafka.publish-timeout") private val publishTimeout: Duration,
    ) : OutboxEventPublisher {
        init {
            require(!publishTimeout.isZero && !publishTimeout.isNegative) {
                "Kafka publish timeout must be positive"
            }
        }

        override fun publish(event: OutboundIntegrationEvent): PublicationOutcome {
            val structuredEvent =
                try {
                    eventMapper.map(event)
                } catch (_: IllegalArgumentException) {
                    return PublicationOutcome.Failed(
                        kind = PublicationFailureKind.NON_RETRYABLE,
                        errorCode = "INVALID_EVENT_PAYLOAD",
                        safeErrorMessage = "Outbound event payload is not valid for publication",
                    )
                }

            return try {
                val message = Message.of(structuredEvent).addMetadata(metadataMapper.map(structuredEvent))
                emitter.sendMessage(message).await().atMost(publishTimeout)
                PublicationOutcome.Acknowledged
            } catch (exception: Exception) {
                classifyFailure(exception)
            }
        }

        private fun classifyFailure(exception: Exception): PublicationOutcome.Failed =
            when {
                exception.hasCause<SerializationException>() -> {
                    PublicationOutcome.Failed(
                        kind = PublicationFailureKind.NON_RETRYABLE,
                        errorCode = "KAFKA_SERIALIZATION_FAILED",
                        safeErrorMessage = "Outbound event could not be serialized",
                    )
                }

                exception.hasCause<TimeoutException>() -> {
                    retryableFailure("Kafka did not acknowledge the event in time")
                }

                else -> {
                    retryableFailure("Kafka did not acknowledge the outbound event")
                }
            }

        private fun retryableFailure(message: String): PublicationOutcome.Failed =
            PublicationOutcome.Failed(
                kind = PublicationFailureKind.RETRYABLE,
                errorCode = "KAFKA_PUBLISH_FAILED",
                safeErrorMessage = message,
            )

        private inline fun <reified T : Throwable> Throwable.hasCause(): Boolean = generateSequence(this) { it.cause }.any { it is T }

        private companion object {
            const val CHANNEL_NAME = "integration-events-out"
        }
    }
