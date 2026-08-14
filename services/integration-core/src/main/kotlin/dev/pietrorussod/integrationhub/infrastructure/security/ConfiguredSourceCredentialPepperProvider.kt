package dev.pietrorussod.integrationhub.infrastructure.security

import jakarta.enterprise.context.ApplicationScoped
import jakarta.inject.Inject
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.util.Base64
import java.util.Optional
import javax.crypto.SecretKey
import javax.crypto.spec.SecretKeySpec

@ApplicationScoped
class ConfiguredSourceCredentialPepperProvider
    @Inject
    constructor(
        @ConfigProperty(name = CONFIG_PROPERTY)
        configuredPeppers: Optional<String>,
    ) : SourceCredentialPepperProvider {
        private val peppers = parse(configuredPeppers.orElse(""))

        override fun findByVersion(version: Short): SecretKey? = peppers[version]

        private fun parse(configuration: String): Map<Short, SecretKey> {
            if (configuration.isEmpty()) {
                return emptyMap()
            }

            val parsed = mutableMapOf<Short, SecretKey>()
            configuration.split(',').forEachIndexed { index, entry ->
                val separator = entry.indexOf(':')
                if (separator <= 0 || separator != entry.lastIndexOf(':')) {
                    invalidEntry(index, "expected <version>:<base64url>")
                }

                val version = entry.substring(0, separator).toShortOrNull()
                if (version == null || version <= 0) {
                    invalidEntry(index, "version must be a positive 16-bit integer")
                }
                if (parsed.containsKey(version)) {
                    invalidEntry(index, "version must be unique")
                }

                val encodedPepper = entry.substring(separator + 1)
                val pepperBytes = decodePepper(encodedPepper, index)
                if (pepperBytes.size < MINIMUM_PEPPER_BYTES) {
                    invalidEntry(index, "pepper must contain at least $MINIMUM_PEPPER_BYTES bytes")
                }

                parsed[version] = SecretKeySpec(pepperBytes, HMAC_SHA_256)
            }
            return parsed.toMap()
        }

        private fun decodePepper(
            encodedPepper: String,
            index: Int,
        ): ByteArray {
            if (!encodedPepper.matches(BASE64URL_PATTERN)) {
                invalidEntry(index, "pepper must use unpadded Base64URL")
            }

            val decoded =
                try {
                    Base64.getUrlDecoder().decode(encodedPepper)
                } catch (_: IllegalArgumentException) {
                    invalidEntry(index, "pepper must use unpadded Base64URL")
                }
            if (Base64.getUrlEncoder().withoutPadding().encodeToString(decoded) != encodedPepper) {
                invalidEntry(index, "pepper must use canonical unpadded Base64URL")
            }
            return decoded
        }

        private fun invalidEntry(
            index: Int,
            reason: String,
        ): Nothing =
            throw IllegalArgumentException(
                "Invalid source credential pepper configuration at entry ${index + 1}: $reason",
            )

        private companion object {
            const val CONFIG_PROPERTY = "integration-hub.security.source-credential-peppers"
            const val HMAC_SHA_256 = "HmacSHA256"
            const val MINIMUM_PEPPER_BYTES = 32
            val BASE64URL_PATTERN = Regex("[A-Za-z0-9_-]+")
        }
    }
