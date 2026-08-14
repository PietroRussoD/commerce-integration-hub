package dev.pietrorussod.integrationhub.infrastructure.provisioning

import dev.pietrorussod.integrationhub.infrastructure.security.ConfiguredSourceCredentialPepperProvider
import dev.pietrorussod.integrationhub.infrastructure.security.SourceCredentialPepperProvider
import org.jooq.DSLContext
import org.jooq.SQLDialect
import org.jooq.impl.DSL
import java.sql.DriverManager
import java.util.Optional

object SourceCredentialAdminCommand {
    @JvmStatic
    fun main(args: Array<String>) {
        val database = DatabaseConfiguration.fromEnvironment()

        DriverManager.getConnection(database.jdbcUrl, database.username, database.password).use { connection ->
            val dslContext = DSL.using(connection, SQLDialect.POSTGRES)
            when (args.firstOrNull()) {
                "provision" -> provision(args, dslContext)
                "revoke" -> revoke(args, dslContext)
                else -> throw IllegalArgumentException(USAGE)
            }
        }
    }

    private fun provision(
        args: Array<String>,
        dslContext: DSLContext,
    ) {
        require(args.size == 3) { USAGE }
        val pepperVersion = args[2].toShortOrNull() ?: throw IllegalArgumentException("Pepper version must be a number")
        val configuredPeppers = requireEnvironment(PEPPERS_ENVIRONMENT_VARIABLE)
        val pepperProvider = ConfiguredSourceCredentialPepperProvider(Optional.of(configuredPeppers))
        val credential = SourceCredentialProvisioner(dslContext, pepperProvider).provision(args[1], pepperVersion)

        println("Source credential provisioned.")
        println("keyId=${credential.keyId}")
        println("apiKey=${credential.apiKey}")
        println("Store the API key securely now; the plaintext secret cannot be recovered from the database.")
    }

    private fun revoke(
        args: Array<String>,
        dslContext: DSLContext,
    ) {
        require(args.size == 2) { USAGE }
        val revoked =
            SourceCredentialProvisioner(dslContext, EMPTY_PEPPER_PROVIDER)
                .revoke(args[1])
        check(revoked) { "Active source credential not found: ${args[1]}" }
        println("Source credential revoked: ${args[1]}")
    }

    private data class DatabaseConfiguration(
        val jdbcUrl: String,
        val username: String,
        val password: String,
    ) {
        companion object {
            fun fromEnvironment(): DatabaseConfiguration =
                DatabaseConfiguration(
                    jdbcUrl = requireEnvironment("DB_JDBC_URL"),
                    username = requireEnvironment("DB_USERNAME"),
                    password = requireEnvironment("DB_PASSWORD"),
                )
        }
    }

    private const val PEPPERS_ENVIRONMENT_VARIABLE = "INTEGRATION_HUB_SECURITY_SOURCE_CREDENTIAL_PEPPERS"
    private const val USAGE =
        "Usage: provision <source-system> <pepper-version> | revoke <key-id>"
    private val EMPTY_PEPPER_PROVIDER = SourceCredentialPepperProvider { null }
}

private fun requireEnvironment(name: String): String =
    System.getenv(name)?.takeIf { it.isNotBlank() }
        ?: throw IllegalArgumentException("Required environment variable is missing: $name")
