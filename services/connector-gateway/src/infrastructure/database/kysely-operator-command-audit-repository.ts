import { randomUUID } from "node:crypto";

import type {
    CompletedOperatorCommand,
    OperatorCommandAuditRepository,
    PersistedOperatorCommandOutcome,
    PersistedOperatorCommandRequest,
    ReservedOperatorCommand
} from "../../application/operator-commands/operator-command-audit.js";
import type { GatewayDatabase } from "./database.js";
import type { Kysely, Transaction } from "kysely";

type AuditDatabase = Kysely<GatewayDatabase> | Transaction<GatewayDatabase>;

export class KyselyOperatorCommandAuditRepository implements OperatorCommandAuditRepository {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public reserve(command: PersistedOperatorCommandRequest): Promise<ReservedOperatorCommand> {
        return reserveOperatorCommandAuditEntry(this.database, command);
    }

    public complete(
        command: PersistedOperatorCommandOutcome
    ): Promise<CompletedOperatorCommand> {
        return completeOperatorCommandAuditEntry(this.database, command);
    }
}

export async function reserveOperatorCommandAuditEntry(
    database: AuditDatabase,
    command: PersistedOperatorCommandRequest
): Promise<ReservedOperatorCommand> {
    const inserted = await database
        .insertInto("operator_command_audit_entries")
        .values({
            action: command.action,
            actor_subject: command.actorSubject,
            command_id: command.commandId,
            error_code: null,
            event_type: "REQUESTED",
            id: randomUUID(),
            idempotency_key: command.idempotencyKey,
            occurred_at: command.occurredAt,
            reason: command.reason,
            target_id: command.deliveryId,
            target_type: "INBOUND_DELIVERY"
        })
        .onConflict((conflict) =>
            conflict
                .columns(["actor_subject", "idempotency_key"])
                .where("event_type", "=", "REQUESTED")
                .doNothing()
        )
        .returning("command_id")
        .executeTakeFirst();
    if (inserted !== undefined) {
        return { commandId: inserted.command_id, status: "CREATED" };
    }

    const existing = await database
        .selectFrom("operator_command_audit_entries")
        .select(["action", "command_id", "reason", "target_id", "target_type"])
        .where("actor_subject", "=", command.actorSubject)
        .where("idempotency_key", "=", command.idempotencyKey)
        .where("event_type", "=", "REQUESTED")
        .executeTakeFirstOrThrow();
    if (
        existing.action !== command.action ||
        existing.reason !== command.reason ||
        existing.target_id !== command.deliveryId ||
        existing.target_type !== "INBOUND_DELIVERY"
    ) {
        return { commandId: existing.command_id, status: "IDEMPOTENCY_CONFLICT" };
    }
    return { commandId: existing.command_id, status: "IDEMPOTENT_REPLAY" };
}

export async function completeOperatorCommandAuditEntry(
    database: AuditDatabase,
    command: PersistedOperatorCommandOutcome
): Promise<CompletedOperatorCommand> {
    const request = await database
        .selectFrom("operator_command_audit_entries")
        .select([
            "action",
            "actor_subject",
            "command_id",
            "idempotency_key",
            "reason",
            "target_id",
            "target_type"
        ])
        .where("command_id", "=", command.commandId)
        .where("event_type", "=", "REQUESTED")
        .executeTakeFirstOrThrow();

    const inserted = await database
        .insertInto("operator_command_audit_entries")
        .values({
            action: request.action,
            actor_subject: request.actor_subject,
            command_id: request.command_id,
            error_code: command.errorCode,
            event_type: command.outcome,
            id: randomUUID(),
            idempotency_key: request.idempotency_key,
            occurred_at: command.occurredAt,
            reason: request.reason,
            target_id: request.target_id,
            target_type: request.target_type
        })
        .onConflict((conflict) =>
            conflict
                .column("command_id")
                .where("event_type", "in", ["FAILED", "REJECTED", "SUCCEEDED"])
                .doNothing()
        )
        .returning("id")
        .executeTakeFirst();
    if (inserted !== undefined) {
        return { status: "COMPLETED" };
    }

    const existing = await database
        .selectFrom("operator_command_audit_entries")
        .select(["error_code", "event_type"])
        .where("command_id", "=", command.commandId)
        .where("event_type", "in", ["FAILED", "REJECTED", "SUCCEEDED"])
        .executeTakeFirstOrThrow();
    return existing.event_type === command.outcome && existing.error_code === command.errorCode
        ? { status: "IDEMPOTENT_REPLAY" }
        : { status: "OUTCOME_CONFLICT" };
}
