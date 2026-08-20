package dev.pietrorussod.integrationhub.application.outbox

import java.time.Clock
import java.time.Instant

class PublishClaimedOutboxEventUseCase(
    private val outboxEventPublisher: OutboxEventPublisher,
    private val outboxRetryPolicy: OutboxRetryPolicy,
    private val completeOutboxEvent: CompleteOutboxEventUseCase,
    private val rescheduleOutboxEvent: RescheduleOutboxEventUseCase,
    private val failOutboxEvent: FailOutboxEventUseCase,
    private val clock: Clock,
) {
    fun publish(event: ClaimedOutboxEvent): PublishClaimedOutboxEventResult =
        when (val outcome = outboxEventPublisher.publish(event.toOutboundIntegrationEvent())) {
            PublicationOutcome.Acknowledged -> {
                transitionResult(
                    applied = completeOutboxEvent.complete(event),
                    result = PublishClaimedOutboxEventResult.Published,
                )
            }

            is PublicationOutcome.Failed -> {
                handleFailure(event, outcome)
            }
        }

    private fun handleFailure(
        event: ClaimedOutboxEvent,
        failure: PublicationOutcome.Failed,
    ): PublishClaimedOutboxEventResult =
        when (failure.kind) {
            PublicationFailureKind.RETRYABLE -> handleRetryableFailure(event, failure)
            PublicationFailureKind.NON_RETRYABLE -> fail(event, failure)
        }

    private fun handleRetryableFailure(
        event: ClaimedOutboxEvent,
        failure: PublicationOutcome.Failed,
    ): PublishClaimedOutboxEventResult =
        when (val retryDecision = outboxRetryPolicy.decide(event.publishAttempts)) {
            is OutboxRetryDecision.RetryAfter -> {
                val nextAttemptAt = clock.instant().plus(retryDecision.delay)
                transitionResult(
                    applied =
                        rescheduleOutboxEvent.reschedule(
                            event = event,
                            nextAttemptAt = nextAttemptAt,
                            errorCode = failure.errorCode,
                            safeErrorMessage = failure.safeErrorMessage,
                        ),
                    result = PublishClaimedOutboxEventResult.Rescheduled(nextAttemptAt),
                )
            }

            OutboxRetryDecision.Exhausted -> {
                fail(event, failure)
            }
        }

    private fun fail(
        event: ClaimedOutboxEvent,
        failure: PublicationOutcome.Failed,
    ): PublishClaimedOutboxEventResult =
        transitionResult(
            applied =
                failOutboxEvent.fail(
                    event = event,
                    errorCode = failure.errorCode,
                    safeErrorMessage = failure.safeErrorMessage,
                ),
            result = PublishClaimedOutboxEventResult.Failed,
        )

    private fun transitionResult(
        applied: Boolean,
        result: PublishClaimedOutboxEventResult,
    ): PublishClaimedOutboxEventResult = if (applied) result else PublishClaimedOutboxEventResult.ClaimLost
}

sealed interface PublishClaimedOutboxEventResult {
    data object Published : PublishClaimedOutboxEventResult

    data class Rescheduled(
        val nextAttemptAt: Instant,
    ) : PublishClaimedOutboxEventResult

    data object Failed : PublishClaimedOutboxEventResult

    data object ClaimLost : PublishClaimedOutboxEventResult
}
