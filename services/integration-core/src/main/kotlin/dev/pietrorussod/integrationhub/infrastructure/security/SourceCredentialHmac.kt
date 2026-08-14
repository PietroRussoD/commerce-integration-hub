package dev.pietrorussod.integrationhub.infrastructure.security

import java.nio.charset.StandardCharsets
import javax.crypto.Mac
import javax.crypto.SecretKey

object SourceCredentialHmac {
    fun calculate(
        secret: String,
        pepper: SecretKey,
    ): ByteArray {
        val mac = Mac.getInstance(ALGORITHM)
        mac.init(pepper)
        return mac.doFinal(secret.toByteArray(StandardCharsets.UTF_8))
    }

    private const val ALGORITHM = "HmacSHA256"
}
