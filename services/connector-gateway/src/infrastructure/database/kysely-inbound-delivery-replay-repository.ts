import type {
    ReplayInboundDeliveryCommand,
    ReplayInboundDeliveryRejectionCode,
    ReplayInboundDeliveryRepository,
    ReplayInboundDeliveryResult
} from "../../application/deliveries/replay-inbound-delivery.js";
import { sql } from "kysely";

import {
    completeOperatorCommandAuditEntry,
    reserveOperatorCommandAuditEntry
} from "./kysely-operator-command-audit-repository.js";
import type {
    ConnectorStatus,
    GatewayDatabase,
    InboundDeliveryStatus
} from "./database.js";
import type { Kysely, Transaction } from "kysely";

type ReplayDatabase = Kysely<GatewayDatabase> | Transaction<GatewayDatabase>;

export class KyselyInboundDeliveryReplayRepository implements ReplayInboundDeliveryRepository {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public replay(command: ReplayInboundDeliveryCommand): Promise<ReplayInboundDeliveryResult> {
        return this.database.transaction().execute(async (transaction) => {
            const reservation = await reserveOperatorCommandAuditEntry(transaction, {
                action: command.action,
                actorSubject: command.actorSubject,
                commandId: command.commandId,
                deliveryId: command.deliveryId,
                idempotencyKey: command.idempotencyKey,
                occurredAt: command.replayedAt,
                reason: command.reason
            });
            if (reservation.status === "IDEMPOTENCY_CONFLICT") {
                return { commandId: reservation.commandId, outcome: "IDEMPOTENCY_CONFLICT" };
            }
            if (reservation.status === "IDEMPOTENT_REPLAY") {
                return replayedCommandResult(transaction, reservation.commandId);
            }

            const delivery = await transaction
                .selectFrom("inbound_deliveries as delivery")
                .innerJoin(
                    "connector_configurations as connector",
                    "connector.id",
                    "delivery.connector_id"
                )
                .select([
                    "delivery.canonical_payload",
                    "delivery.payload_expires_at",
                    "delivery.status",
                    "connector.status as connector_status"
                ])
                .where("delivery.id", "=", command.deliveryId)
                .forUpdate("delivery")
                .executeTakeFirst();
            // Sample after the row lock: a request may have waited across expiry.
            const databaseTime = await sql<{ now: Date }>`
                SELECT clock_timestamp() AS now
            `.execute(transaction);
            const rejectionCode = readRejectionCode(delivery, databaseTime.rows[0]!.now);
            if (rejectionCode !== null) {
                await recordRejectedCommand(transaction, command, rejectionCode);
                return {
                    commandId: command.commandId,
                    outcome: "REJECTED",
                    rejectionCode
                };
            }

            const previousAttemptContext = await transaction
                .selectFrom("delivery_attempts")
                .select(["traceparent", "tracestate"])
                .where("delivery_id", "=", command.deliveryId)
                .where("traceparent", "is not", null)
                .orderBy("attempt_number", "desc")
                .executeTakeFirst();

            const replayed = await transaction
                .updateTable("inbound_deliveries")
                .set({
                    completed_at: null,
                    error_code: null,
                    last_core_order_id: null,
                    last_http_status: null,
                    lease_expires_at: null,
                    lease_owner: null,
                    lease_token: null,
                    next_attempt_at: command.replayedAt,
                    safe_error_message: null,
                    traceparent: command.traceContext?.traceparent ?? null,
                    tracestate: command.traceContext?.tracestate ?? null,
                    replay_link_traceparent: previousAttemptContext?.traceparent ?? null,
                    replay_link_tracestate: previousAttemptContext?.tracestate ?? null,
                    status: "RECEIVED",
                    updated_at: command.replayedAt
                })
                .where("id", "=", command.deliveryId)
                .where("status", "=", "EXHAUSTED")
                .returning("id")
                .executeTakeFirst();
            if (replayed === undefined) {
                throw new Error("Inbound delivery changed while preparing operator replay");
            }

            await completeOperatorCommandAuditEntry(transaction, {
                commandId: command.commandId,
                errorCode: null,
                occurredAt: command.replayedAt,
                outcome: "SUCCEEDED"
            });
            return { commandId: command.commandId, outcome: "REPLAYED" };
        });
    }
}

function readRejectionCode(
    delivery:
        | {
              canonical_payload: unknown;
              connector_status: ConnectorStatus;
              payload_expires_at: Date;
              status: InboundDeliveryStatus;
          }
        | undefined,
    replayedAt: Date
): ReplayInboundDeliveryRejectionCode | null {
    if (delivery === undefined) {
        return "DELIVERY_NOT_FOUND";
    }
    if (delivery.status !== "EXHAUSTED") {
        return "DELIVERY_NOT_REPLAYABLE";
    }
    if (delivery.canonical_payload === null || delivery.payload_expires_at <= replayedAt) {
        return "DELIVERY_PAYLOAD_EXPIRED";
    }
    return delivery.connector_status === "ACTIVE" ? null : "CONNECTOR_NOT_ACTIVE";
}

async function recordRejectedCommand(
    database: ReplayDatabase,
    command: ReplayInboundDeliveryCommand,
    rejectionCode: ReplayInboundDeliveryRejectionCode
): Promise<void> {
    await completeOperatorCommandAuditEntry(database, {
        commandId: command.commandId,
        errorCode: rejectionCode,
        occurredAt: command.replayedAt,
        outcome: "REJECTED"
    });
}

async function replayedCommandResult(
    database: ReplayDatabase,
    commandId: string
): Promise<ReplayInboundDeliveryResult> {
    const terminalEvent = await database
        .selectFrom("operator_command_audit_entries")
        .select(["error_code", "event_type"])
        .where("command_id", "=", commandId)
        .where("event_type", "in", ["FAILED", "REJECTED", "SUCCEEDED"])
        .executeTakeFirst();
    if (terminalEvent === undefined) {
        return { commandId, outcome: "IN_PROGRESS" };
    }
    if (terminalEvent.event_type === "SUCCEEDED") {
        return { commandId, idempotent: true, outcome: "REPLAYED" };
    }
    if (terminalEvent.event_type !== "REJECTED" || terminalEvent.error_code === null) {
        throw new Error("Operator delivery replay has an unexpected terminal audit outcome");
    }
    return {
        commandId,
        idempotent: true,
        outcome: "REJECTED",
        rejectionCode: readPersistedRejectionCode(terminalEvent.error_code)
    };
}

function readPersistedRejectionCode(errorCode: string): ReplayInboundDeliveryRejectionCode {
    switch (errorCode) {
        case "CONNECTOR_NOT_ACTIVE":
        case "DELIVERY_NOT_FOUND":
        case "DELIVERY_NOT_REPLAYABLE":
        case "DELIVERY_PAYLOAD_EXPIRED":
            return errorCode;
        default:
            throw new Error("Operator delivery replay has an unknown rejection code");
    }
}
