package dev.pietrorussod.integrationhub.application.outbox

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.time.Duration

class OutboxRetryPolicyTest {
    @Test
    fun `applies bounded exponential backoff`() {
        val policy = policy(jitterSample = 1.0)

        assertRetryDelay(policy, publishAttempts = 1, expectedSeconds = 10)
        assertRetryDelay(policy, publishAttempts = 2, expectedSeconds = 20)
        assertRetryDelay(policy, publishAttempts = 3, expectedSeconds = 40)
        assertRetryDelay(policy, publishAttempts = 4, expectedSeconds = 60)
        assertEquals(OutboxRetryDecision.Exhausted, policy.decide(publishAttempts = 5))
    }

    @Test
    fun `uses equal jitter within the current delay limit`() {
        assertRetryDelay(policy(jitterSample = 0.0), publishAttempts = 2, expectedSeconds = 10)
        assertRetryDelay(policy(jitterSample = 0.5), publishAttempts = 2, expectedSeconds = 15)
        assertRetryDelay(policy(jitterSample = 1.0), publishAttempts = 2, expectedSeconds = 20)
    }

    @Test
    fun `keeps the minimum retry delay positive`() {
        val policy =
            BoundedExponentialBackoffRetryPolicy(
                baseDelay = Duration.ofMillis(1),
                maxDelay = Duration.ofMillis(1),
                maxAttempts = 2,
                jitterSample = { 0.0 },
            )

        assertEquals(
            OutboxRetryDecision.RetryAfter(Duration.ofMillis(1)),
            policy.decide(publishAttempts = 1),
        )
    }

    @Test
    fun `rejects invalid configuration`() {
        assertThrows(IllegalArgumentException::class.java) {
            BoundedExponentialBackoffRetryPolicy(Duration.ZERO, Duration.ofSeconds(10), 5)
        }
        assertThrows(IllegalArgumentException::class.java) {
            BoundedExponentialBackoffRetryPolicy(Duration.ofSeconds(10), Duration.ofSeconds(5), 5)
        }
        assertThrows(IllegalArgumentException::class.java) {
            BoundedExponentialBackoffRetryPolicy(Duration.ofSeconds(10), Duration.ofSeconds(60), 0)
        }
    }

    @Test
    fun `rejects invalid runtime inputs`() {
        val policy = policy(jitterSample = 1.0)

        assertThrows(IllegalArgumentException::class.java) { policy.decide(publishAttempts = 0) }
        listOf(Double.NaN, -0.1, 1.1).forEach { invalidSample ->
            assertThrows(IllegalArgumentException::class.java) {
                policy(jitterSample = invalidSample).decide(publishAttempts = 1)
            }
        }
    }

    private fun policy(jitterSample: Double): OutboxRetryPolicy =
        BoundedExponentialBackoffRetryPolicy(
            baseDelay = Duration.ofSeconds(10),
            maxDelay = Duration.ofSeconds(60),
            maxAttempts = 5,
            jitterSample = { jitterSample },
        )

    private fun assertRetryDelay(
        policy: OutboxRetryPolicy,
        publishAttempts: Int,
        expectedSeconds: Long,
    ) {
        assertEquals(
            OutboxRetryDecision.RetryAfter(Duration.ofSeconds(expectedSeconds)),
            policy.decide(publishAttempts),
        )
    }
}
