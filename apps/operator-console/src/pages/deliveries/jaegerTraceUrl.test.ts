import { describe, expect, test } from "vitest";

import { jaegerTraceUrl } from "./jaegerTraceUrl";

const traceId = "0123456789abcdef0123456789abcdef";

describe("jaegerTraceUrl", () => {
  test("builds a Jaeger trace deep link from the configured base URL", () => {
    expect(jaegerTraceUrl(traceId, "http://localhost:16686/")).toBe(
      `http://localhost:16686/trace/${traceId}`,
    );
  });

  test("keeps a configured URL path prefix", () => {
    expect(jaegerTraceUrl(traceId, "https://observability.example.test/jaeger")).toBe(
      `https://observability.example.test/jaeger/trace/${traceId}`,
    );
  });

  test.each(["invalid", "javascript:alert(1)"]) ("does not create an unsafe or invalid link for %s", (baseUrl) => {
    expect(jaegerTraceUrl(traceId, baseUrl)).toBeNull();
  });

  test("does not expose a trace when the viewer or trace ID is unavailable", () => {
    expect(jaegerTraceUrl(traceId, "")).toBeNull();
    expect(jaegerTraceUrl(null, "http://localhost:16686")).toBeNull();
    expect(jaegerTraceUrl("trace-42", "http://localhost:16686")).toBeNull();
  });
});
