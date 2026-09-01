import { Kysely, PostgresDialect, type Generated, type JSONColumnType } from "kysely";
import { Pool } from "pg";

import type { CanonicalOrder } from "../../application/orders/canonical-order.js";
import type { DatabaseConfiguration } from "./database-configuration.js";

export type ConnectorProvider = "ERP_B" | "MARKETPLACE_A";
export type ConnectorMode = "POLLING" | "WEBHOOK";
export type ConnectorStatus = "ACTIVE" | "BLOCKED_CONFIGURATION" | "DISABLED";
export type InboundDeliveryStatus =
    | "BLOCKED_CONFIGURATION"
    | "DELIVERED"
    | "EXHAUSTED"
    | "FORWARDING"
    | "PERMANENT_FAILURE"
    | "RECEIVED"
    | "RETRY_WAIT";
export type DeliveryAttemptOutcome =
    | "BLOCKED_CONFIGURATION"
    | "DELIVERED"
    | "PERMANENT_FAILURE"
    | "RETRYABLE_FAILURE";

export interface ConnectorConfigurationsTable {
    readonly id: string;
    readonly provider: ConnectorProvider;
    readonly source_system: string;
    readonly mode: ConnectorMode;
    readonly status: ConnectorStatus;
    readonly schedule: string | null;
    readonly secret_reference: string;
    readonly version: Generated<number>;
    readonly created_at: Generated<Date>;
    readonly updated_at: Generated<Date>;
}

export interface InboundDeliveriesTable {
    readonly id: string;
    readonly connector_id: string;
    readonly external_event_id: string;
    readonly provider_payload_hash: string;
    readonly raw_payload: JSONColumnType<
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>
    >;
    readonly canonical_payload: JSONColumnType<
        CanonicalOrder | null,
        CanonicalOrder | null,
        CanonicalOrder | null
    >;
    readonly mapping_version: string;
    readonly status: Generated<InboundDeliveryStatus>;
    readonly attempt_count: Generated<number>;
    readonly next_attempt_at: Generated<Date>;
    readonly lease_owner: string | null;
    readonly lease_token: Generated<string | null>;
    readonly lease_expires_at: Date | null;
    readonly error_code: string | null;
    readonly safe_error_message: string | null;
    readonly last_http_status: number | null;
    readonly correlation_id: string | null;
    readonly last_core_order_id: string | null;
    readonly received_at: Generated<Date>;
    readonly updated_at: Generated<Date>;
    readonly completed_at: Date | null;
    readonly payload_expires_at: Generated<Date>;
}

export interface PollingCheckpointsTable {
    readonly connector_id: string;
    readonly cursor: string | null;
    readonly version: Generated<number>;
    readonly lease_owner: string | null;
    readonly lease_token: string | null;
    readonly lease_expires_at: Date | null;
    readonly last_polled_at: Date | null;
    readonly last_successful_poll_at: Date | null;
    readonly created_at: Generated<Date>;
    readonly updated_at: Generated<Date>;
}

export interface DeliveryAttemptsTable {
    readonly id: string;
    readonly delivery_id: string;
    readonly attempt_number: number;
    readonly started_at: Date;
    readonly completed_at: Date | null;
    readonly outcome: DeliveryAttemptOutcome | null;
    readonly http_status: number | null;
    readonly error_code: string | null;
    readonly safe_error_message: string | null;
    readonly duration_ms: number | null;
    readonly trace_id: string | null;
}

export interface GatewayDatabase {
    readonly connector_configurations: ConnectorConfigurationsTable;
    readonly delivery_attempts: DeliveryAttemptsTable;
    readonly inbound_deliveries: InboundDeliveriesTable;
    readonly polling_checkpoints: PollingCheckpointsTable;
}

export function createDatabase(configuration: DatabaseConfiguration): Kysely<GatewayDatabase> {
    return new Kysely<GatewayDatabase>({
        dialect: new PostgresDialect({
            pool: new Pool({
                connectionTimeoutMillis: configuration.connectionTimeoutMilliseconds,
                connectionString: configuration.connectionString,
                max: configuration.maxPoolSize
            })
        })
    });
}
