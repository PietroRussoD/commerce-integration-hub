package dev.pietrorussod.integrationhub.infrastructure.messaging

import dev.pietrorussod.integrationhub.application.search.OrderSearchProjection
import dev.pietrorussod.integrationhub.application.search.RecordOrderSearchProjectionProgressUseCase
import dev.pietrorussod.integrationhub.infrastructure.observability.OrderSearchProjectionMetrics
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
        private val recordProjectionProgress: RecordOrderSearchProjectionProgressUseCase,
        private val metrics: OrderSearchProjectionMetrics,
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
            try {
                val outcome = projection.upsert(messageMapper.map(event))
                recordProjectionProgress.record(event.occurredAt)?.let { projectedAt ->
                    metrics.recordProjectionProgress(event.occurredAt, projectedAt)
                }
                metrics.recordProjection(outcome)
            } catch (exception: InvalidOrderReadyEventException) {
                metrics.recordInvalidEvent()
                throw exception
            } catch (exception: Exception) {
                metrics.recordFailedAttempt()
                throw exception
            }
        }

        private companion object {
            const val CHANNEL_NAME = "order-ready-search-in"
        }
    }
