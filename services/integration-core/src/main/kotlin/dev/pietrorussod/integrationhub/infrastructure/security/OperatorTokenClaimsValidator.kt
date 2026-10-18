package dev.pietrorussod.integrationhub.infrastructure.security

import io.quarkus.arc.Unremovable
import jakarta.enterprise.context.ApplicationScoped
import org.jose4j.jwt.consumer.JwtContext
import org.jose4j.jwt.consumer.Validator

@Unremovable
@ApplicationScoped
class OperatorTokenClaimsValidator : Validator {
    override fun validate(jwtContext: JwtContext): String? {
        val claims = jwtContext.jwtClaims
        val subject = claims.getClaimValue("sub")
        if (subject !is String || subject.isEmpty() || subject.length > 200 ||
            subject.first() in SUBJECT_EDGE_WHITESPACE || subject.last() in SUBJECT_EDGE_WHITESPACE
        ) {
            return "Invalid operator subject"
        }
        // Jose4j hasClaim treats explicit null as absent; the contract rejects null.
        if (claims.claimsMap.containsKey("groups")) {
            val groups = claims.getClaimValue("groups")
            if (groups !is List<*> || groups.size > 50 ||
                groups.any { it !is String || it.isEmpty() || it.length > 100 }
            ) {
                return "Invalid operator groups"
            }
        }
        return null
    }

    private companion object {
        // Match JavaScript String.trim() in the Gateway, including NBSP and BOM.
        const val SUBJECT_EDGE_WHITESPACE =
            "\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF"
    }
}
