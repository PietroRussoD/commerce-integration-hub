import { describe, expect, it } from "vitest";

import { startConnectorGatewayTelemetry } from "./connector-gateway-telemetry.js";

describe("connector gateway telemetry", () => {
    it("stays disabled unless explicitly enabled", async () => {
        const telemetry = startConnectorGatewayTelemetry({});

        expect(telemetry.instrumentation).toBeUndefined();
        await expect(telemetry.shutdown()).resolves.toBeUndefined();
    });

    it("starts the tracing SDK when explicitly enabled", async () => {
        const telemetry = startConnectorGatewayTelemetry({ OTEL_SDK_DISABLED: "false" });

        expect(telemetry.instrumentation).toBeDefined();
        await expect(telemetry.shutdown()).resolves.toBeUndefined();
    });
});
