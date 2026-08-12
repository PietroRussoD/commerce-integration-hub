package dev.pietrorussod.integrationhub.domain.order

import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test

class PayloadFingerprintTest {
    @Test
    fun `rejects a malformed hash`() {
        assertThrows(IllegalArgumentException::class.java) {
            PayloadFingerprint("not-a-sha-256-hash", 1)
        }
    }

    @Test
    fun `rejects a non-positive canonicalization version`() {
        assertThrows(IllegalArgumentException::class.java) {
            PayloadFingerprint("a".repeat(64), 0)
        }
    }
}
