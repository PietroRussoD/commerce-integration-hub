import { describe, expect, it } from "vitest";

import { createMarketplaceAWebhookTimestampValidator } from "./webhook-timestamp-validator.js";

const NOW_MILLISECONDS = 1_784_073_600_500;
const TOLERANCE_SECONDS = 300;

describe("MARKETPLACE_A webhook timestamp validator", () => {
    const validate = createMarketplaceAWebhookTimestampValidator({
        currentTimeMilliseconds: () => NOW_MILLISECONDS,
        toleranceSeconds: TOLERANCE_SECONDS
    });

    it.each(["1784073600", "1784073300", "1784073900"])(
        "accepts a timestamp inside the allowed window: %s",
        (timestamp) => {
            expect(validate(timestamp)).toBe(true);
        }
    );

    it.each(["1784073299", "1784073901"])(
        "rejects a timestamp outside the allowed window: %s",
        (timestamp) => {
            expect(validate(timestamp)).toBe(false);
        }
    );

    it.each(["", "-1", "+1784073600", "1784073600.5", "01784073600", "9007199254740992"])(
        "rejects a non-canonical or unsafe timestamp: %s",
        (timestamp) => {
            expect(validate(timestamp)).toBe(false);
        }
    );

    it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
        "rejects an invalid timestamp tolerance: %s",
        (toleranceSeconds) => {
            expect(() =>
                createMarketplaceAWebhookTimestampValidator({
                    currentTimeMilliseconds: () => NOW_MILLISECONDS,
                    toleranceSeconds
                })
            ).toThrow("Webhook timestamp tolerance must be a non-negative safe integer");
        }
    );
});
