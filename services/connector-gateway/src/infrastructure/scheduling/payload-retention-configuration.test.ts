import { describe, expect, it, vi } from "vitest";
import { readPayloadRetentionConfiguration } from "./payload-retention-configuration.js";

describe("payload retention configuration", () => {
    it.each([{}, { PAYLOAD_RETENTION_ENABLED: "false", PAYLOAD_RETENTION_BATCH_SIZE: "invalid" }])(
        "does no cleanup unless explicitly enabled", environment => {
            expect(readPayloadRetentionConfiguration(environment)).toEqual({ enabled: false });
        }
    );
    it("reads the process environment", () => {
        vi.stubEnv("PAYLOAD_RETENTION_ENABLED", "false");
        try { expect(readPayloadRetentionConfiguration()).toEqual({ enabled: false }); }
        finally { vi.unstubAllEnvs(); }
    });
    it("provides bounded defaults", () => {
        expect(readPayloadRetentionConfiguration({ PAYLOAD_RETENTION_ENABLED: "true" })).toEqual({
            enabled: true, batchSize: 50, intervalMilliseconds: 60_000
        });
    });
    it.each([["1", "100"], ["100", "86400000"]])("accepts boundary values %s, %s", (batch, interval) => {
        expect(readPayloadRetentionConfiguration({
            PAYLOAD_RETENTION_ENABLED: "true", PAYLOAD_RETENTION_BATCH_SIZE: batch,
            PAYLOAD_RETENTION_INTERVAL_MILLISECONDS: interval
        })).toEqual({ enabled: true, batchSize: Number(batch), intervalMilliseconds: Number(interval) });
    });
    it.each(["TRUE", "1", "yes", ""])("rejects ambiguous enablement %s", value => {
        expect(() => readPayloadRetentionConfiguration({ PAYLOAD_RETENTION_ENABLED: value }))
            .toThrow("PAYLOAD_RETENTION_ENABLED must be true or false");
    });
    it.each([
        ["PAYLOAD_RETENTION_BATCH_SIZE", "0"], ["PAYLOAD_RETENTION_BATCH_SIZE", "101"],
        ["PAYLOAD_RETENTION_BATCH_SIZE", "1.5"], ["PAYLOAD_RETENTION_BATCH_SIZE", "01"],
        ["PAYLOAD_RETENTION_BATCH_SIZE", "9007199254740992"],
        ["PAYLOAD_RETENTION_INTERVAL_MILLISECONDS", "99"],
        ["PAYLOAD_RETENTION_INTERVAL_MILLISECONDS", "86400001"],
        ["PAYLOAD_RETENTION_INTERVAL_MILLISECONDS", ""]
    ])("rejects %s=%s", (name, value) => {
        expect(() => readPayloadRetentionConfiguration({ PAYLOAD_RETENTION_ENABLED: "true", [name]: value }))
            .toThrow(`${name} must be an integer between`);
    });
});
