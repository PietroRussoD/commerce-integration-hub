package dev.pietrorussod.integrationhub.api.security

import jakarta.ws.rs.NameBinding

@NameBinding
@Retention(AnnotationRetention.RUNTIME)
@Target(AnnotationTarget.CLASS, AnnotationTarget.FUNCTION)
annotation class SourceAuthenticated

const val SOURCE_API_KEY_HEADER = "X-Source-API-Key"
const val SOURCE_API_KEY_SECURITY_SCHEME = "sourceApiKey"
