package dev.pietrorussod.integrationhub.infrastructure.messaging

import io.smallrye.reactive.messaging.kafka.api.OutgoingKafkaRecordMetadata
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.apache.kafka.common.header.internals.RecordHeaders
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.nio.charset.StandardCharsets

@ApplicationScoped
class StructuredEventKafkaMetadataMapper
    @Inject
    constructor(
        @param:ConfigProperty(name = "integration-hub.kafka.topics.order-received")
        private val orderReceivedTopic: String,
        @param:ConfigProperty(name = "integration-hub.kafka.topics.order-ready")
        private val orderReadyTopic: String,
    ) {
        init {
            require(orderReceivedTopic.isNotBlank()) { "OrderReceived Kafka topic must not be blank" }
            require(orderReadyTopic.isNotBlank()) { "OrderReady Kafka topic must not be blank" }
        }

        fun map(event: StructuredEvent): OutgoingKafkaRecordMetadata<String> =
            OutgoingKafkaRecordMetadata
                .builder<String>()
                .withTopic(topicFor(event))
                .withKey(event.aggregateId.toString())
                .withHeaders(
                    RecordHeaders()
                        .add(EVENT_ID_HEADER, event.eventId.toString().toHeaderValue())
                        .add(EVENT_TYPE_HEADER, event.eventType.toHeaderValue())
                        .add(EVENT_VERSION_HEADER, event.eventVersion.toString().toHeaderValue())
                        .add(CORRELATION_ID_HEADER, event.correlationId.toString().toHeaderValue())
                        .add(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE.toHeaderValue()),
                ).build()

        private fun topicFor(event: StructuredEvent): String =
            when (event.eventType to event.eventVersion) {
                ORDER_RECEIVED_V1 -> orderReceivedTopic

                ORDER_READY_V2 -> orderReadyTopic

                else -> throw IllegalArgumentException(
                    "No Kafka topic configured for ${event.eventType}.v${event.eventVersion}",
                )
            }

        private fun String.toHeaderValue(): ByteArray = toByteArray(StandardCharsets.UTF_8)

        private companion object {
            const val EVENT_ID_HEADER = "event-id"
            const val EVENT_TYPE_HEADER = "event-type"
            const val EVENT_VERSION_HEADER = "event-version"
            const val CORRELATION_ID_HEADER = "correlation-id"
            const val CONTENT_TYPE_HEADER = "content-type"
            const val JSON_CONTENT_TYPE = "application/json"
            val ORDER_RECEIVED_V1 = "OrderReceived" to 1
            val ORDER_READY_V2 = "OrderReady" to 2
        }
    }
