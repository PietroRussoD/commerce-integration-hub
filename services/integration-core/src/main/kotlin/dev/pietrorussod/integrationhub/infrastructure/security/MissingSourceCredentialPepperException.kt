package dev.pietrorussod.integrationhub.infrastructure.security

class MissingSourceCredentialPepperException(
    version: Short,
) : IllegalStateException("Source credential pepper version $version is not configured")
