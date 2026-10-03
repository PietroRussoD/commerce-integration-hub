import { describe, expect, it } from "vitest";

import {
    createActiveDeliveryTrace,
    readTraceContext,
    startConnectorGatewayTelemetry
} from "./connector-gateway-telemetry.js";

describe("connector gateway telemetry", () => {
    it("reads only W3C trace context fields from a carrier", () => {
        expect(readTraceContext({})).toBeUndefined();
        expect(
            readTraceContext({
                traceparent: "00-11111111111111111111111111111111-2222222222222222-01"
            })
        ).toEqual({
            traceparent: "00-11111111111111111111111111111111-2222222222222222-01"
        });
        expect(
            readTraceContext({
                traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
                tracestate: "vendor=value",
                baggage: "not-persisted"
            })
        ).toEqual({
            traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
            tracestate: "vendor=value"
        });
    });

    it("omits active delivery metadata when W3C context cannot be injected", () => {
        expect(createActiveDeliveryTrace(undefined, "11111111111111111111111111111111")).toBeUndefined();
        expect(
            createActiveDeliveryTrace(
                { traceparent: "00-11111111111111111111111111111111-2222222222222222-01" },
                "11111111111111111111111111111111"
            )
        ).toEqual({
            context: {
                traceparent: "00-11111111111111111111111111111111-2222222222222222-01"
            },
            traceId: "11111111111111111111111111111111"
        });
    });

    it("stays disabled unless explicitly enabled", async () => {
        const telemetry = startConnectorGatewayTelemetry({});

        expect(telemetry.instrumentation).toBeUndefined();
        await expect(
            telemetry.runWithDeliveryTraceContext(undefined, (activeTrace) => Promise.resolve(activeTrace))
        ).resolves.toBeUndefined();
        await expect(
            telemetry.withProviderReceiptTrace((traceContext) => Promise.resolve(traceContext))
        ).resolves.toBeUndefined();
        const parent = {
            traceparent: "00-11111111111111111111111111111111-2222222222222222-01"
        };
        await expect(
            telemetry.runWithDeliveryTraceContext(parent, (activeTrace) => Promise.resolve(activeTrace))
        ).resolves.toEqual({ context: parent });
        await expect(telemetry.shutdown()).resolves.toBeUndefined();
    });

    it("starts child attempt spans and propagates W3C context when enabled", async () => {
        const previousSampler = process.env.OTEL_TRACES_SAMPLER;
        process.env.OTEL_TRACES_SAMPLER = "always_off";
        const telemetry = startConnectorGatewayTelemetry({ OTEL_SDK_DISABLED: "false" });
        try {
            expect(telemetry.instrumentation).toBeDefined();
            const parent = {
                traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
                tracestate: "vendor=value"
            };
            await telemetry.runWithDeliveryTraceContext(parent, (activeTrace) => {
                expect(activeTrace).toBeDefined();
                expect(activeTrace?.traceId).toBe("11111111111111111111111111111111");
                expect(activeTrace?.context.traceparent).toMatch(
                    /^00-11111111111111111111111111111111-(?!2222222222222222)[0-9a-f]{16}-[0-9a-f]{2}$/
                );
                expect(activeTrace?.context.tracestate).toBe("vendor=value");
                return Promise.resolve();
            });
            await telemetry.runWithDeliveryTraceContext(undefined, (activeTrace) => {
                expect(activeTrace?.traceId).toMatch(/^[0-9a-f]{32}$/);
                return Promise.resolve();
            });
            await telemetry.withProviderReceiptTrace((traceContext) => {
                expect(traceContext?.traceparent).toMatch(
                    /^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/
                );
                return Promise.resolve();
            });
            await expect(telemetry.shutdown()).resolves.toBeUndefined();
        } finally {
            if (previousSampler === undefined) {
                delete process.env.OTEL_TRACES_SAMPLER;
            } else {
                process.env.OTEL_TRACES_SAMPLER = previousSampler;
            }
        }
    });
});
