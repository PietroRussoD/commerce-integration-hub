package dev.pietrorussod.integrationhub.infrastructure.security

import org.jboss.logmanager.ExtLogRecord
import org.jboss.logmanager.formatters.PatternFormatter
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertSame
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.util.logging.Level
import java.util.logging.LogRecord

class OperatorOidcLogFilterTest {
    private val filter = OperatorOidcLogFilter()

    @ParameterizedTest
    @ValueSource(
        strings = [
            "Verification of the token issued to client %s has failed: %s.",
            "Token verification has failed: %s",
        ],
    )
    fun `replaces token failure diagnostics before formatting`(message: String) {
        val record = ExtLogRecord(Level.WARNING, message, ExtLogRecord.FormatStyle.PRINTF, javaClass.name)
        record.loggerName = OIDC_PROVIDER_LOGGER
        record.parameters =
            if (message.startsWith("Verification")) {
                arrayOf("synthetic-client", "Invalid JWS Signature: $SYNTHETIC_TOKEN")
            } else {
                arrayOf("Invalid JWS Signature: $SYNTHETIC_TOKEN")
            }
        record.thrown = IllegalArgumentException("Invalid signature: $SYNTHETIC_TOKEN")
        record.putMdc("correlationId", "synthetic-correlation")
        val formatter = PatternFormatter("%s")
        assertTrue(formatter.format(record).contains(SYNTHETIC_TOKEN))

        assertTrue(filter.isLoggable(record))
        assertEquals("Operator bearer token verification failed", formatter.format(record))
        assertNull(record.parameters)
        assertNull(record.thrown)
        assertEquals(Level.WARNING, record.level)
        assertEquals(OIDC_PROVIDER_LOGGER, record.loggerName)
        assertEquals("synthetic-correlation", record.getMdc("correlationId"))
    }

    @Test
    fun `removes an already formatted token rejection diagnostic`() {
        val record = LogRecord(Level.WARNING, "Token verification has failed: $SYNTHETIC_TOKEN")
        record.loggerName = OIDC_PROVIDER_LOGGER

        assertTrue(filter.isLoggable(record))
        assertEquals("Operator bearer token verification failed", record.message)
    }

    @Test
    fun `preserves unrelated provider warnings and application logs`() {
        for ((loggerName, message) in listOf(
            OIDC_PROVIDER_LOGGER to "Identity provider connection unavailable",
            "application.Logger" to "Token verification has failed: application diagnostic",
        )) {
            val record = LogRecord(Level.WARNING, message)
            record.loggerName = loggerName
            val parameters = arrayOf<Any>("safe diagnostic")
            val failure = IllegalStateException("safe failure")
            record.parameters = parameters
            record.thrown = failure

            assertTrue(filter.isLoggable(record))
            assertEquals(message, record.message)
            assertSame(parameters, record.parameters)
            assertSame(failure, record.thrown)
        }
    }

    private companion object {
        const val OIDC_PROVIDER_LOGGER = "io.quarkus.oidc.runtime.OidcProvider"
        const val SYNTHETIC_TOKEN = "synthetic-header.synthetic-claims.synthetic-signature"
    }
}
