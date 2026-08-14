package dev.pietrorussod.integrationhub.application.authentication

interface SourceCredentialRepository {
    fun findByKeyId(keyId: String): SourceCredential?
}
