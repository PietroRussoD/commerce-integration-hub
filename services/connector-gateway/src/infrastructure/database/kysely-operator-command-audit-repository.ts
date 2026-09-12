import { randomUUID } from "node:crypto";

import type {
    CompletedOperatorCommand,
    OperatorCommandAuditRepository,
    PersistedOperatorCommandOutcome,
    PersistedOperatorCommandRequest,
    ReservedOperatorCommand
} from "../../application/operator-commands/operator-command-audit.js";
import type { GatewayDatabase } from "./database.js";
import type { Kysely } from "kysely";

export class KyselyOperatorCommandAuditRepository implements OperatorCommandAuditRepository {
    public constructor(private readonly database: Kysely<GatewayDatabase>) {}

    public async reserve(command: PersistedOperatorCommandRequest): Promise<ReservedOperatorCommand> {
        try {
            const inserted = await this.database
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
                .returning("command_id")
                .executeTakeFirst();
            if (inserted !== undefined) {
                return { commandId: inserted.command_id, status: "CREATED" };
            }
        } catch (error) {
            if (!isUniqueViolation(error)) {
                throw error;
            }
        }

        const existing = await this.database
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

    public async complete(
        command: PersistedOperatorCommandOutcome
    ): Promise<CompletedOperatorCommand> {
        const request = await this.database
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

        try {
            await this.database
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
                .execute();
            return { status: "COMPLETED" };
        } catch (error) {
            if (!isUniqueViolation(error)) {
                throw error;
            }
        }

        const existing = await this.database
            .selectFrom("operator_command_audit_entries")
            .select(["error_code", "event_type"])
            .where("command_id", "=", command.commandId)
            .where("event_type", "in", ["FAILED", "REJECTED", "SUCCEEDED"])
            .executeTakeFirstOrThrow();
        return existing.event_type === command.outcome && existing.error_code === command.errorCode
            ? { status: "IDEMPOTENT_REPLAY" }
            : { status: "OUTCOME_CONFLICT" };
    }
}

function isUniqueViolation(error: unknown): boolean {
    return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
