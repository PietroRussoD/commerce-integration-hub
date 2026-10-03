import { context, propagation, ROOT_CONTEXT, trace } from "@opentelemetry/api";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { NodeSDK } from "@opentelemetry/sdk-node";

import type {
    ActiveDeliveryTrace,
    DeliveryTraceRunner,
    ProviderReceiptTraceRunner,
    TraceContext
} from "../../application/observability/trace-context.js";

export interface ConnectorGatewayTelemetry {
    readonly instrumentation?: InstanceType<typeof FastifyOtelInstrumentation>;
    readonly runWithDeliveryTraceContext: DeliveryTraceRunner;
    readonly withProviderReceiptTrace: ProviderReceiptTraceRunner;
    readonly shutdown: () => Promise<void>;
}

export function startConnectorGatewayTelemetry(
    environment: Readonly<Record<string, string | undefined>> = process.env
): ConnectorGatewayTelemetry {
    if (environment.OTEL_SDK_DISABLED !== "false") {
        return {
            runWithDeliveryTraceContext: runWithoutCreatingSpan,
            withProviderReceiptTrace: runWithoutProviderReceiptTrace,
            shutdown: () => Promise.resolve()
        };
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
        runWithDeliveryTraceContext: runWithDeliveryTrace,
        withProviderReceiptTrace: runWithProviderReceiptTrace,
        shutdown: () => sdk.shutdown()
    };
}

function runWithoutCreatingSpan<Result>(
    parent: TraceContext | undefined,
    operation: (activeTrace: ActiveDeliveryTrace | undefined) => Promise<Result>
): Promise<Result> {
    const parentContext = parent === undefined ? context.active() : propagation.extract(ROOT_CONTEXT, parent);
    return context.with(parentContext, () =>
        operation(parent === undefined ? undefined : { context: parent })
    );
}

async function runWithDeliveryTrace<Result>(
    parent: TraceContext | undefined,
    operation: (activeTrace: ActiveDeliveryTrace | undefined) => Promise<Result>
): Promise<Result> {
    const parentContext = parent === undefined ? ROOT_CONTEXT : propagation.extract(ROOT_CONTEXT, parent);
    const tracer = trace.getTracer("commerce-integration-hub.connector-gateway");
    return context.with(parentContext, () =>
        tracer.startActiveSpan("connector-gateway.delivery.attempt", async (span) => {
            try {
                const carrier: Record<string, string> = {};
                propagation.inject(context.active(), carrier);
                const activeTraceContext = readTraceContext(carrier);
                return await operation(
                    createActiveDeliveryTrace(activeTraceContext, span.spanContext().traceId)
                );
            } finally {
                span.end();
            }
        })
    );
}

function runWithoutProviderReceiptTrace<Result>(
    operation: (traceContext: TraceContext | undefined) => Promise<Result>
): Promise<Result> {
    return operation(undefined);
}

function runWithProviderReceiptTrace<Result>(
    operation: (traceContext: TraceContext | undefined) => Promise<Result>
): Promise<Result> {
    const tracer = trace.getTracer("commerce-integration-hub.connector-gateway");
    return context.with(ROOT_CONTEXT, () =>
        tracer.startActiveSpan(
            "connector-gateway.webhook.receipt",
            {},
            ROOT_CONTEXT,
            async (span) => {
                try {
                    const carrier: Record<string, string> = {};
                    propagation.inject(context.active(), carrier);
                    return await operation(readTraceContext(carrier));
                } finally {
                    span.end();
                }
            }
        )
    );
}

export function createActiveDeliveryTrace(
    traceContext: TraceContext | undefined,
    traceId: string
): ActiveDeliveryTrace | undefined {
    return traceContext === undefined ? undefined : { context: traceContext, traceId };
}

export function readTraceContext(carrier: Readonly<Record<string, string>>): TraceContext | undefined {
    const traceparent = carrier.traceparent;
    if (traceparent === undefined) {
        return undefined;
    }
    const tracestate = carrier.tracestate;
    return tracestate === undefined ? { traceparent } : { traceparent, tracestate };
}
