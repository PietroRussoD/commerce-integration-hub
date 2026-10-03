package dev.pietrorussod.integrationhub.infrastructure.messaging

import dev.pietrorussod.integrationhub.application.outbox.OutboundIntegrationEvent
import dev.pietrorussod.integrationhub.application.outbox.OutboxEventPublisher
import dev.pietrorussod.integrationhub.application.outbox.PublicationFailureKind
import dev.pietrorussod.integrationhub.application.outbox.PublicationOutcome
import dev.pietrorussod.integrationhub.application.telemetry.TraceContext
import io.opentelemetry.api.OpenTelemetry
import io.opentelemetry.api.trace.Span
import io.opentelemetry.api.trace.SpanKind
import io.opentelemetry.api.trace.StatusCode
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator
import io.opentelemetry.context.Context
import io.opentelemetry.context.propagation.TextMapGetter
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
        private val openTelemetry: OpenTelemetry,
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
            val spanBuilder =
                openTelemetry
                    .getTracer(INSTRUMENTATION_NAME)
                    .spanBuilder(OUTBOX_PUBLISH_SPAN_NAME)
                    .setSpanKind(SpanKind.PRODUCER)
            val parentContext = event.traceContext?.let(::extractTraceContext) ?: Context.root()
            if (Span.fromContext(parentContext).spanContext.isValid) {
                spanBuilder.setParent(parentContext)
            } else {
                spanBuilder.setNoParent()
            }
            val span = spanBuilder.startSpan()
            val scope = span.makeCurrent()

            try {
                val outcome = publishWithinSpan(event)
                if (outcome is PublicationOutcome.Failed) {
                    span.setStatus(StatusCode.ERROR)
                    span.setAttribute(ERROR_TYPE_ATTRIBUTE, outcome.errorCode)
                }
                return outcome
            } catch (exception: Exception) {
                span.setStatus(StatusCode.ERROR)
                throw exception
            } finally {
                scope.close()
                span.end()
            }
        }

        private fun publishWithinSpan(event: OutboundIntegrationEvent): PublicationOutcome {
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

            val metadata =
                try {
                    metadataMapper.map(structuredEvent)
                } catch (_: IllegalArgumentException) {
                    return PublicationOutcome.Failed(
                        kind = PublicationFailureKind.NON_RETRYABLE,
                        errorCode = "UNSUPPORTED_EVENT_ROUTE",
                        safeErrorMessage = "Outbound event has no configured Kafka route",
                    )
                }

            return try {
                val message = Message.of(structuredEvent).addMetadata(metadata)
                emitter.sendMessage(message).await().atMost(publishTimeout)
                PublicationOutcome.Acknowledged
            } catch (exception: Exception) {
                KafkaPublicationFailureClassifier.classify(exception)
            }
        }

        private fun extractTraceContext(traceContext: TraceContext): Context {
            val carrier =
                buildMap {
                    put(TRACEPARENT_HEADER, traceContext.traceparent)
                    traceContext.tracestate?.let { put(TRACESTATE_HEADER, it) }
                }
            return W3CTraceContextPropagator
                .getInstance()
                .extract(Context.root(), carrier, MapGetter)
        }

        private object MapGetter : TextMapGetter<Map<String, String>> {
            override fun keys(carrier: Map<String, String>): Iterable<String> = carrier.keys

            override fun get(
                carrier: Map<String, String>?,
                key: String,
            ): String? = carrier?.get(key)
        }

        private companion object {
            const val CHANNEL_NAME = "integration-events-out"
            const val INSTRUMENTATION_NAME = "dev.pietrorussod.integrationhub.outbox"
            const val OUTBOX_PUBLISH_SPAN_NAME = "outbox.publish"
            const val TRACEPARENT_HEADER = "traceparent"
            const val TRACESTATE_HEADER = "tracestate"
            const val ERROR_TYPE_ATTRIBUTE = "error.type"
        }
    }

internal object KafkaPublicationFailureClassifier {
    fun classify(exception: Exception): PublicationOutcome.Failed =
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
}
