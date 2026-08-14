package dev.pietrorussod.integrationhub.infrastructure.security

import javax.crypto.SecretKey

fun interface SourceCredentialPepperProvider {
    fun findByVersion(version: Short): SecretKey?
}
