import {
    type MarketplaceAWebhookAuthenticator,
    createMarketplaceAWebhookAuthenticator
} from "./webhook-authenticator.js";
import type { MarketplaceAWebhookSecurityConfiguration } from "./webhook-security-configuration.js";
import { createMarketplaceAWebhookSignatureVerifier } from "./webhook-signature-verifier.js";
import { createMarketplaceAWebhookSignatureVerifierResolver } from "./webhook-signature-verifier-registry.js";
import { createMarketplaceAWebhookTimestampValidator } from "./webhook-timestamp-validator.js";

export function createConfiguredMarketplaceAWebhookAuthenticator(
    configuration: MarketplaceAWebhookSecurityConfiguration,
    currentTimeMilliseconds: () => number = Date.now
): MarketplaceAWebhookAuthenticator {
    const currentKey = {
        keyId: configuration.currentKey.keyId,
        verifySignature: createMarketplaceAWebhookSignatureVerifier(
            configuration.currentKey.secret
        )
    };
    const previousKey =
        configuration.previousKey === undefined
            ? undefined
            : {
                  keyId: configuration.previousKey.keyId,
                  verifySignature: createMarketplaceAWebhookSignatureVerifier(
                      configuration.previousKey.secret
                  ),
                  acceptedUntilMilliseconds:
                      configuration.previousKey.acceptedUntilMilliseconds
              };
    const resolveSignatureVerifier =
        previousKey === undefined
            ? createMarketplaceAWebhookSignatureVerifierResolver({
                  currentKey,
                  currentTimeMilliseconds
              })
            : createMarketplaceAWebhookSignatureVerifierResolver({
                  currentKey,
                  previousKey,
                  currentTimeMilliseconds
              });
    const validateTimestamp = createMarketplaceAWebhookTimestampValidator({
        currentTimeMilliseconds,
        toleranceSeconds: configuration.timestampToleranceSeconds
    });

    return createMarketplaceAWebhookAuthenticator({
        resolveSignatureVerifier,
        validateTimestamp
    });
}
