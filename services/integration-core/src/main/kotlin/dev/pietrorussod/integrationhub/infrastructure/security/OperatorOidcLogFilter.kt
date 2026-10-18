package dev.pietrorussod.integrationhub.infrastructure.security

import io.quarkus.logging.LoggingFilter
import java.util.logging.Filter
import java.util.logging.LogRecord

@LoggingFilter(name = "operator-oidc")
class OperatorOidcLogFilter : Filter {
    override fun isLoggable(record: LogRecord): Boolean {
        if (record.loggerName == OIDC_PROVIDER_LOGGER &&
            (
                record.message?.startsWith("Verification of the token issued to client ") == true ||
                    record.message?.startsWith("Token verification has failed:") == true
            )
        ) {
            // Quarkus failure arguments can contain the entire JWT. Replace the diagnostic
            // before formatting, including parameters and any attached exception.
            record.message = "Operator bearer token verification failed"
            record.parameters = null
            record.thrown = null
        }
        return true
    }

    private companion object {
        const val OIDC_PROVIDER_LOGGER = "io.quarkus.oidc.runtime.OidcProvider"
    }
}
