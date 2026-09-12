import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createOperatorCommandAuditor } from "../../src/application/operator-commands/operator-command-audit.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { KyselyOperatorCommandAuditRepository } from "../../src/infrastructure/database/kysely-operator-command-audit-repository.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";

const ACTOR_SUBJECT = "operator-integration-test";
const COMMAND_ID = "0199037b-6400-7000-8000-000000000811";
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000812";
const IDEMPOTENCY_KEY = "0199037b-6400-7000-8000-000000000813";
const REQUEST_ENTRY_ID = "0199037b-6400-7000-8000-000000000814";

describe("operator command audit storage", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 2
        });
        await migrateToLatest(database);
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("retains an append-only command journal with bounded idempotency", async () => {
        await database.insertInto("operator_command_audit_entries").values(request()).execute();
        await database
            .insertInto("operator_command_audit_entries")
            .values({
                ...request(),
                id: "0199037b-6400-7000-8000-000000000815",
                event_type: "SUCCEEDED"
            })
            .execute();

        await expect(
            database
                .insertInto("operator_command_audit_entries")
                .values({
                    ...request(),
                    command_id: "0199037b-6400-7000-8000-000000000816",
                    id: "0199037b-6400-7000-8000-000000000817"
                })
                .execute()
        ).rejects.toMatchObject({ code: "23505" });
        await expect(
            database
                .updateTable("operator_command_audit_entries")
                .set({ reason: "Changed after the fact" })
                .where("id", "=", REQUEST_ENTRY_ID)
                .execute()
        ).rejects.toMatchObject({ code: "55000" });
        await expect(
            database
                .deleteFrom("operator_command_audit_entries")
                .where("id", "=", REQUEST_ENTRY_ID)
                .execute()
        ).rejects.toMatchObject({ code: "55000" });
    });

    it("reserves and completes commands idempotently", async () => {
        const auditor = createOperatorCommandAuditor({
            clock: () => new Date("2026-09-12T09:00:00.000Z"),
            createCommandId: () => "0199037b-6400-7000-8000-000000000818",
            repository: new KyselyOperatorCommandAuditRepository(database)
        });
        const request = {
            actorSubject: "operator-43",
            deliveryId: "0199037b-6400-7000-8000-000000000819",
            idempotencyKey: "0199037b-6400-7000-8000-000000000820",
            reason: "Retry after the upstream incident was resolved"
        };

        await expect(auditor.reserveDeliveryReplay(request)).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000818",
            status: "CREATED"
        });
        await expect(auditor.reserveDeliveryReplay(request)).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000818",
            status: "IDEMPOTENT_REPLAY"
        });
        await expect(
            auditor.reserveDeliveryReplay({ ...request, reason: "Different intent" })
        ).resolves.toEqual({
            commandId: "0199037b-6400-7000-8000-000000000818",
            status: "IDEMPOTENCY_CONFLICT"
        });

        await expect(
            auditor.complete({
                commandId: "0199037b-6400-7000-8000-000000000818",
                outcome: "SUCCEEDED"
            })
        ).resolves.toEqual({ status: "COMPLETED" });
        await expect(
            auditor.complete({
                commandId: "0199037b-6400-7000-8000-000000000818",
                outcome: "SUCCEEDED"
            })
        ).resolves.toEqual({ status: "IDEMPOTENT_REPLAY" });
        await expect(
            auditor.complete({
                commandId: "0199037b-6400-7000-8000-000000000818",
                errorCode: "DELIVERY_NOT_REPLAYABLE",
                outcome: "REJECTED"
            })
        ).resolves.toEqual({ status: "OUTCOME_CONFLICT" });
    });
});

function request() {
    return {
        action: "DELIVERY_REPLAY",
        actor_subject: ACTOR_SUBJECT,
        command_id: COMMAND_ID,
        error_code: null,
        event_type: "REQUESTED" as const,
        id: REQUEST_ENTRY_ID,
        idempotency_key: IDEMPOTENCY_KEY,
        occurred_at: new Date("2026-09-12T08:00:00.000Z"),
        reason: "Retry after the upstream incident was resolved",
        target_id: DELIVERY_ID,
        target_type: "INBOUND_DELIVERY"
    };
}
