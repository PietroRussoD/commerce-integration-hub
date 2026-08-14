package dev.pietrorussod.integrationhub.infrastructure.security

import org.junit.jupiter.api.Assertions.assertArrayEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import java.util.Base64
import java.util.Optional

class ConfiguredSourceCredentialPepperProviderTest {
    @Test
    fun `returns configured peppers by version`() {
        val firstPepper = ByteArray(32) { it.toByte() }
        val secondPepper = ByteArray(48) { (it + 1).toByte() }
        val provider =
            provider(
                "1:${encode(firstPepper)},2:${encode(secondPepper)}",
            )

        assertArrayEquals(firstPepper, provider.findByVersion(1)?.encoded)
        assertArrayEquals(secondPepper, provider.findByVersion(2)?.encoded)
        assertNull(provider.findByVersion(3))
    }

    @Test
    fun `allows an absent configuration`() {
        val provider = ConfiguredSourceCredentialPepperProvider(Optional.empty())

        assertNull(provider.findByVersion(1))
    }

    @Test
    fun `rejects malformed weak and duplicate entries without exposing their values`() {
        val validPepper = encode(ByteArray(32) { it.toByte() })
        val invalidConfigurations =
            listOf(
                "missing-separator",
                "0:$validPepper",
                "version:$validPepper",
                "1:${encode(ByteArray(31))}",
                "1:$validPepper,1:$validPepper",
                "1:$validPepper=",
                "1:$validPepper,",
                ",1:$validPepper",
                " 1:$validPepper",
            )

        invalidConfigurations.forEach { configuration ->
            val exception =
                assertThrows(IllegalArgumentException::class.java) {
                    provider(configuration)
                }
            assertFalse(exception.message.orEmpty().contains(configuration))
            assertFalse(exception.message.orEmpty().contains(validPepper))
        }
    }

    private fun provider(configuration: String) = ConfiguredSourceCredentialPepperProvider(Optional.of(configuration))

    private fun encode(value: ByteArray): String = Base64.getUrlEncoder().withoutPadding().encodeToString(value)
}
