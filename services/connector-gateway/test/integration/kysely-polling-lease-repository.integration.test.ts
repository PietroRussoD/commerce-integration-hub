import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { Kysely } from "kysely";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AcquirePollingLeaseCommand } from "../../src/application/polling/acquire-polling-lease.js";
import { createDatabase, type GatewayDatabase } from "../../src/infrastructure/database/database.js";
import { migrateToLatest } from "../../src/infrastructure/database/migrator.js";
import { KyselyPollingLeaseRepository } from "../../src/infrastructure/database/kysely-polling-lease-repository.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const ACQUIRED_AT = new Date("2026-09-01T09:00:00.000Z");
const LEASE_EXPIRES_AT = new Date("2026-09-01T09:01:00.000Z");

describe("KyselyPollingLeaseRepository", () => {
    let container: StartedPostgreSqlContainer;
    let database: Kysely<GatewayDatabase>;
    let repository: KyselyPollingLeaseRepository;

    beforeAll(async () => {
        container = await new PostgreSqlContainer("postgres:18.3").start();
        database = createDatabase({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: container.getConnectionUri(),
            maxPoolSize: 8
        });
        await migrateToLatest(database);
        repository = new KyselyPollingLeaseRepository(database);
    });

    beforeEach(async () => {
        await database
            .updateTable("connector_configurations")
            .set({ status: "ACTIVE", updated_at: ACQUIRED_AT })
            .where("id", "=", CONNECTOR_ID)
            .execute();
        await clearLease();
    });

    afterAll(async () => {
        await database?.destroy();
        await container?.stop();
    });

    it("acquires an available checkpoint without changing its cursor version", async () => {
        await expect(repository.tryAcquire(command("000000000401"))).resolves.toEqual({
            checkpointVersion: 1,
            connectorId: CONNECTOR_ID,
            cursor: null,
            leaseExpiresAt: LEASE_EXPIRES_AT,
            leaseToken: "0199037b-6400-7000-8000-000000000401"
        });
        await expect(storedLease()).resolves.toMatchObject({
            lease_owner: "poller-a",
            lease_token: "0199037b-6400-7000-8000-000000000401",
            lease_expires_at: LEASE_EXPIRES_AT,
            version: 1
        });
    });

    it("does not replace an unexpired lease", async () => {
        await repository.tryAcquire(command("000000000401"));

        await expect(repository.tryAcquire(command("000000000402", "poller-b"))).resolves.toBeNull();
        await expect(storedLease()).resolves.toMatchObject({
            lease_owner: "poller-a",
            lease_token: "0199037b-6400-7000-8000-000000000401"
        });
    });

    it("replaces an expired lease with a new fencing token", async () => {
        await database
            .updateTable("polling_checkpoints")
            .set({
                lease_owner: "stale-poller",
                lease_token: "0199037b-6400-7000-8000-000000000400",
                lease_expires_at: ACQUIRED_AT,
                updated_at: new Date("2026-09-01T08:59:00.000Z")
            })
            .where("connector_id", "=", CONNECTOR_ID)
            .execute();

        await expect(repository.tryAcquire(command("000000000403"))).resolves.toMatchObject({
            leaseToken: "0199037b-6400-7000-8000-000000000403"
        });
        await expect(storedLease()).resolves.toMatchObject({
            lease_owner: "poller-a",
            lease_token: "0199037b-6400-7000-8000-000000000403"
        });
    });

    it("allows only one concurrent worker to acquire the checkpoint", async () => {
        const results = await Promise.all([
            repository.tryAcquire(command("000000000404", "poller-a")),
            repository.tryAcquire(command("000000000405", "poller-b"))
        ]);

        expect(results.filter((result) => result !== null)).toHaveLength(1);
        expect(results.filter((result) => result === null)).toHaveLength(1);
        const lease = await storedLease();
        expect(["poller-a", "poller-b"]).toContain(lease.lease_owner);
    });

    it("does not acquire a checkpoint for a disabled connector", async () => {
        await database
            .updateTable("connector_configurations")
            .set({ status: "DISABLED", updated_at: ACQUIRED_AT })
            .where("id", "=", CONNECTOR_ID)
            .execute();

        await expect(repository.tryAcquire(command("000000000406"))).resolves.toBeNull();
        await expect(storedLease()).resolves.toMatchObject({
            lease_owner: null,
            lease_token: null,
            lease_expires_at: null
        });
    });

    function command(
        tokenSuffix: string,
        workerId = "poller-a"
    ): AcquirePollingLeaseCommand {
        return {
            acquiredAt: ACQUIRED_AT,
            connectorId: CONNECTOR_ID,
            leaseExpiresAt: LEASE_EXPIRES_AT,
            leaseToken: `0199037b-6400-7000-8000-${tokenSuffix}`,
            workerId
        };
    }

    async function clearLease(): Promise<void> {
        await database
            .updateTable("polling_checkpoints")
            .set({
                lease_owner: null,
                lease_token: null,
                lease_expires_at: null,
                updated_at: ACQUIRED_AT
            })
            .where("connector_id", "=", CONNECTOR_ID)
            .execute();
    }

    async function storedLease() {
        return database
            .selectFrom("polling_checkpoints")
            .select(["lease_owner", "lease_token", "lease_expires_at", "version"])
            .where("connector_id", "=", CONNECTOR_ID)
            .executeTakeFirstOrThrow();
    }
});
