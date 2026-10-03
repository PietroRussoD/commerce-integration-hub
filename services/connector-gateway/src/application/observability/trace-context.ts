export interface TraceContext {
    readonly traceparent: string;
    readonly tracestate?: string;
}

export interface ActiveDeliveryTrace {
    readonly context: TraceContext;
    readonly traceId?: string;
}

export type DeliveryTraceRunner = <Result>(
    parent: TraceContext | undefined,
    operation: (activeTrace: ActiveDeliveryTrace | undefined) => Promise<Result>
) => Promise<Result>;

export type CurrentTraceContext = () => TraceContext | undefined;

export type ProviderReceiptTraceRunner = <Result>(
    operation: (traceContext: TraceContext | undefined) => Promise<Result>
) => Promise<Result>;
