package dev.pietrorussod.integrationhub.application.outbox

import java.time.Duration

fun interface OutboxRetryPolicy {
    fun decide(publishAttempts: Int): OutboxRetryDecision
}

sealed interface OutboxRetryDecision {
    data class RetryAfter(
        val delay: Duration,
    ) : OutboxRetryDecision

    data object Exhausted : OutboxRetryDecision
}

class BoundedExponentialBackoffRetryPolicy(
    baseDelay: Duration,
    maxDelay: Duration,
    private val maxAttempts: Int,
    private val jitterSample: () -> Double = Math::random,
) : OutboxRetryPolicy {
    private val baseDelayMillis = baseDelay.toMillis()
    private val maxDelayMillis = maxDelay.toMillis()

    init {
        require(baseDelayMillis > 0) { "Outbox retry base delay must be at least one millisecond" }
        require(maxDelayMillis >= baseDelayMillis) {
            "Outbox retry maximum delay must not be shorter than the base delay"
        }
        require(maxAttempts > 0) { "Outbox retry maximum attempts must be positive" }
    }

    override fun decide(publishAttempts: Int): OutboxRetryDecision {
        require(publishAttempts > 0) { "Outbox publish attempts must be positive" }
        if (publishAttempts >= maxAttempts) {
            return OutboxRetryDecision.Exhausted
        }

        val delayLimit = calculateDelayLimit(publishAttempts)
        val sample = jitterSample()
        require(sample.isFinite() && sample in 0.0..1.0) {
            "Outbox retry jitter sample must be between zero and one"
        }
        val minimumDelay = delayLimit / 2 + delayLimit % 2
        val jitterRange = delayLimit - minimumDelay
        val delayMillis = minimumDelay + (jitterRange * sample).toLong()

        return OutboxRetryDecision.RetryAfter(Duration.ofMillis(delayMillis))
    }

    private fun calculateDelayLimit(publishAttempts: Int): Long {
        var delay = baseDelayMillis
        repeat(publishAttempts - 1) {
            if (delay >= maxDelayMillis || delay > maxDelayMillis / 2) {
                return maxDelayMillis
            }
            delay *= 2
        }
        return minOf(delay, maxDelayMillis)
    }
}
