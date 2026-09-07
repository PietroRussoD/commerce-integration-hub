package dev.pietrorussod.integrationhub.infrastructure.messaging

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjection
import io.smallrye.reactive.messaging.annotations.Blocking
import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.eclipse.microprofile.faulttolerance.Retry
import org.eclipse.microprofile.reactive.messaging.Acknowledgment
import org.eclipse.microprofile.reactive.messaging.Incoming
import java.time.temporal.ChronoUnit

@ApplicationScoped
class OrderReadySearchProjectionKafkaConsumer
    @Inject
    constructor(
        private val messageMapper: OrderReadyMessageMapper,
        private val projection: OrderSearchProjection,
    ) {
        @Incoming(CHANNEL_NAME)
        @Acknowledgment(Acknowledgment.Strategy.POST_PROCESSING)
        @Blocking
        @Retry(
            maxRetries = 3,
            delay = 500,
            delayUnit = ChronoUnit.MILLIS,
            jitter = 100,
            jitterDelayUnit = ChronoUnit.MILLIS,
            retryOn = [Exception::class],
            abortOn = [InvalidOrderReadyEventException::class],
        )
        fun consume(event: StructuredEvent) {
            projection.upsert(messageMapper.map(event))
        }

        private companion object {
            const val CHANNEL_NAME = "order-ready-search-in"
        }
    }
