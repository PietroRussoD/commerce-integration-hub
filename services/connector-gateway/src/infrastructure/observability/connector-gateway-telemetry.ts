import { FastifyOtelInstrumentation } from "@fastify/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { NodeSDK } from "@opentelemetry/sdk-node";

export interface ConnectorGatewayTelemetry {
    readonly instrumentation?: InstanceType<typeof FastifyOtelInstrumentation>;
    readonly shutdown: () => Promise<void>;
}

export function startConnectorGatewayTelemetry(
    environment: Readonly<Record<string, string | undefined>> = process.env
): ConnectorGatewayTelemetry {
    if (environment.OTEL_SDK_DISABLED !== "false") {
        return { shutdown: () => Promise.resolve() };
    }

    const instrumentation = new FastifyOtelInstrumentation({ instrumentHooks: false });
    const sdk = new NodeSDK({
        instrumentations: [instrumentation],
        serviceName: "connector-gateway",
        traceExporter: new OTLPTraceExporter()
    });
    sdk.start();

    return {
        instrumentation,
        shutdown: () => sdk.shutdown()
    };
}
