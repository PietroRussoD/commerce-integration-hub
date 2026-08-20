package dev.pietrorussod.integrationhub.infrastructure.messaging

import io.smallrye.reactive.messaging.kafka.api.OutgoingKafkaRecordMetadata
import jakarta.enterprise.context.ApplicationScoped
import org.apache.kafka.common.header.internals.RecordHeaders
import java.nio.charset.StandardCharsets

@ApplicationScoped
class StructuredEventKafkaMetadataMapper {
    fun map(event: StructuredEvent): OutgoingKafkaRecordMetadata<String> =
        OutgoingKafkaRecordMetadata
            .builder<String>()
            .withKey(event.aggregateId.toString())
            .withHeaders(
                RecordHeaders()
                    .add(EVENT_ID_HEADER, event.eventId.toString().toHeaderValue())
                    .add(EVENT_TYPE_HEADER, event.eventType.toHeaderValue())
                    .add(EVENT_VERSION_HEADER, event.eventVersion.toString().toHeaderValue())
                    .add(CORRELATION_ID_HEADER, event.correlationId.toString().toHeaderValue())
                    .add(CONTENT_TYPE_HEADER, JSON_CONTENT_TYPE.toHeaderValue()),
            ).build()

    private fun String.toHeaderValue(): ByteArray = toByteArray(StandardCharsets.UTF_8)

    private companion object {
        const val EVENT_ID_HEADER = "event-id"
        const val EVENT_TYPE_HEADER = "event-type"
        const val EVENT_VERSION_HEADER = "event-version"
        const val CORRELATION_ID_HEADER = "correlation-id"
        const val CONTENT_TYPE_HEADER = "content-type"
        const val JSON_CONTENT_TYPE = "application/json"
    }
}
