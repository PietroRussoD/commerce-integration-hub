import { sql, type Kysely } from "kysely";

import type {
    InboundDeliveryDetail,
    InboundDeliveryDetailRepository
} from "../../application/deliveries/get-inbound-delivery.js";
import type {
    InboundDeliveryInspectionRepository,
    InboundDeliveryPage,
    ListInboundDeliveriesQuery
} from "../../application/deliveries/list-inbound-deliveries.js";
import type { GatewayDatabase } from "./database.js";

const CURSOR_TIMESTAMP_EXPRESSION = sql<string>`to_char(
    delivery.received_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
)`;

export class KyselyInboundDeliveryInspectionRepository
    implements InboundDeliveryDetailRepository, InboundDeliveryInspectionRepository
{
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public async list(query: ListInboundDeliveriesQuery): Promise<InboundDeliveryPage> {
        let statement = this.database
            .selectFrom("inbound_deliveries as delivery")
            .innerJoin(
                "connector_configurations as connector",
                "connector.id",
                "delivery.connector_id"
            )
            .select([
                "delivery.attempt_count",
                "delivery.completed_at",
                "delivery.correlation_id",
                "delivery.error_code",
                "delivery.external_event_id",
                "delivery.id",
                "delivery.last_core_order_id",
                "delivery.last_http_status",
                "delivery.received_at",
                "delivery.status",
                "delivery.updated_at",
                "connector.provider",
                "connector.source_system",
                CURSOR_TIMESTAMP_EXPRESSION.as("cursor_received_at")
            ]);

        if (query.provider !== undefined) {
            statement = statement.where("connector.provider", "=", query.provider);
        }
        if (query.statuses !== undefined) {
            statement = statement.where("delivery.status", "in", query.statuses);
        }
        const cursor = query.cursor;
        if (cursor !== undefined) {
            statement = statement.where((expressions) =>
                expressions.or([
                    expressions(
                        "delivery.received_at",
                        "<",
                        sql<Date>`${cursor.receivedAt}::timestamptz`
                    ),
                    expressions.and([
                        expressions(
                            "delivery.received_at",
                            "=",
                            sql<Date>`${cursor.receivedAt}::timestamptz`
                        ),
                        expressions("delivery.id", "<", cursor.deliveryId)
                    ])
                ])
            );
        }

        const rows = await statement
            .orderBy("delivery.received_at", "desc")
            .orderBy("delivery.id", "desc")
            .limit(query.limit + 1)
            .execute();
        const hasNextPage = rows.length > query.limit;
        const visibleRows = hasNextPage ? rows.slice(0, query.limit) : rows;
        const lastVisibleRow = visibleRows.at(-1);

        return {
            items: visibleRows.map((row) => ({
                attemptCount: row.attempt_count,
                completedAt: row.completed_at,
                correlationId: row.correlation_id,
                deliveryId: row.id,
                errorCode: row.error_code,
                externalEventId: row.external_event_id,
                lastCoreOrderId: row.last_core_order_id,
                lastHttpStatus: row.last_http_status,
                provider: row.provider,
                receivedAt: row.received_at,
                sourceSystem: row.source_system,
                status: row.status,
                updatedAt: row.updated_at
            })),
            nextCursor:
                hasNextPage && lastVisibleRow !== undefined
                    ? {
                          deliveryId: lastVisibleRow.id,
                          receivedAt: lastVisibleRow.cursor_received_at
                      }
                    : null
        };
    }

    public findById(deliveryId: string): Promise<InboundDeliveryDetail | null> {
        return this.database
            .transaction()
            .setIsolationLevel("repeatable read")
            .execute(async (transaction) => {
                const delivery = await transaction
                    .selectFrom("inbound_deliveries as delivery")
                    .innerJoin(
                        "connector_configurations as connector",
                        "connector.id",
                        "delivery.connector_id"
                    )
                    .select([
                        "delivery.attempt_count",
                        "delivery.completed_at",
                        "delivery.connector_id",
                        "delivery.correlation_id",
                        "delivery.error_code",
                        "delivery.external_event_id",
                        "delivery.id",
                        "delivery.last_core_order_id",
                        "delivery.last_http_status",
                        "delivery.mapping_version",
                        "delivery.next_attempt_at",
                        "delivery.payload_expires_at",
                        "delivery.received_at",
                        "delivery.safe_error_message",
                        "delivery.status",
                        "delivery.updated_at",
                        "connector.mode",
                        "connector.provider",
                        "connector.source_system",
                        "connector.status as connector_status",
                        sql<boolean>`delivery.canonical_payload IS NOT NULL`.as(
                            "payload_retained"
                        )
                    ])
                    .where("delivery.id", "=", deliveryId)
                    .executeTakeFirst();

                if (delivery === undefined) {
                    return null;
                }

                const attempts = await transaction
                    .selectFrom("delivery_attempts")
                    .selectAll()
                    .where("delivery_id", "=", deliveryId)
                    .orderBy("attempt_number", "asc")
                    .execute();

                return {
                    attemptCount: delivery.attempt_count,
                    attempts: attempts.map((attempt) => ({
                        attemptId: attempt.id,
                        attemptNumber: attempt.attempt_number,
                        completedAt: attempt.completed_at,
                        durationMilliseconds: attempt.duration_ms,
                        errorCode: attempt.error_code,
                        httpStatus: attempt.http_status,
                        outcome: attempt.outcome,
                        safeErrorMessage: attempt.safe_error_message,
                        startedAt: attempt.started_at,
                        traceId: attempt.trace_id
                    })),
                    completedAt: delivery.completed_at,
                    connectorId: delivery.connector_id,
                    connectorMode: delivery.mode,
                    connectorStatus: delivery.connector_status,
                    correlationId: delivery.correlation_id,
                    deliveryId: delivery.id,
                    errorCode: delivery.error_code,
                    externalEventId: delivery.external_event_id,
                    lastCoreOrderId: delivery.last_core_order_id,
                    lastHttpStatus: delivery.last_http_status,
                    mappingVersion: delivery.mapping_version,
                    nextAttemptAt: delivery.next_attempt_at,
                    payloadExpiresAt: delivery.payload_expires_at,
                    payloadRetained: delivery.payload_retained,
                    provider: delivery.provider,
                    receivedAt: delivery.received_at,
                    safeErrorMessage: delivery.safe_error_message,
                    sourceSystem: delivery.source_system,
                    status: delivery.status,
                    updatedAt: delivery.updated_at
                };
            });
    }
}
