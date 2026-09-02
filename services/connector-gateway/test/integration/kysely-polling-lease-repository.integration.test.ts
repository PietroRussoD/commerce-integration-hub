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
const RENEWED_AT = new Date("2026-09-01T09:00:30.000Z");
const RENEWED_EXPIRES_AT = new Date("2026-09-01T09:01:30.000Z");

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
            .set({ status: "ACTIVE", updated_at: ACQUIRED_AT, version: 1 })
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

    it("renews the current unexpired lease without changing checkpoint version", async () => {
        await repository.tryAcquire(command("000000000407"));

        await expect(repository.renew(renewCommand("000000000407"))).resolves.toEqual({
            leaseExpiresAt: RENEWED_EXPIRES_AT
        });
        await expect(storedLease()).resolves.toMatchObject({
            lease_expires_at: RENEWED_EXPIRES_AT,
            lease_owner: "poller-a",
            lease_token: "0199037b-6400-7000-8000-000000000407",
            version: 1
        });
    });

    it("does not shorten a lease when the requested renewal expires earlier", async () => {
        await repository.tryAcquire(command("000000000408"));

        await expect(
            repository.renew({
                ...renewCommand("000000000408"),
                leaseExpiresAt: new Date("2026-09-01T09:00:45.000Z")
            })
        ).resolves.toEqual({ leaseExpiresAt: LEASE_EXPIRES_AT });
        await expect(storedLease()).resolves.toMatchObject({
            lease_expires_at: LEASE_EXPIRES_AT
        });
    });

    it.each([
        ["stale owner", { workerId: "poller-b" }],
        ["stale token", { leaseToken: "0199037b-6400-7000-8000-000000000499" }],
        ["expired lease", { renewedAt: LEASE_EXPIRES_AT }]
    ] as const)("rejects renewal for a %s", async (_case, overrides) => {
        await repository.tryAcquire(command("000000000409"));

        await expect(
            repository.renew({ ...renewCommand("000000000409"), ...overrides })
        ).resolves.toBeNull();
        await expect(storedLease()).resolves.toMatchObject({
            lease_expires_at: LEASE_EXPIRES_AT,
            lease_owner: "poller-a",
            lease_token: "0199037b-6400-7000-8000-000000000409"
        });
    });

    it("rejects renewal after the connector is disabled", async () => {
        await repository.tryAcquire(command("000000000410"));
        await database
            .updateTable("connector_configurations")
            .set({ status: "DISABLED", updated_at: RENEWED_AT })
            .where("id", "=", CONNECTOR_ID)
            .execute();

        await expect(repository.renew(renewCommand("000000000410"))).resolves.toBeNull();
    });

    it("releases the matching lease without changing checkpoint version", async () => {
        await repository.tryAcquire(command("000000000411"));

        await expect(repository.release(releaseCommand("000000000411"))).resolves.toBe(true);
        await expect(storedLease()).resolves.toMatchObject({
            lease_expires_at: null,
            lease_owner: null,
            lease_token: null,
            version: 1
        });
    });

    it.each([
        ["stale owner", { workerId: "poller-b" }],
        ["stale token", { leaseToken: "0199037b-6400-7000-8000-000000000499" }]
    ] as const)("does not release ownership with a %s", async (_case, overrides) => {
        await repository.tryAcquire(command("000000000412"));

        await expect(
            repository.release({ ...releaseCommand("000000000412"), ...overrides })
        ).resolves.toBe(false);
        await expect(storedLease()).resolves.toMatchObject({
            lease_owner: "poller-a",
            lease_token: "0199037b-6400-7000-8000-000000000412"
        });
    });

    it("allows the matching owner to clear an expired lease", async () => {
        await repository.tryAcquire(command("000000000413"));

        await expect(
            repository.release({
                ...releaseCommand("000000000413"),
                releasedAt: LEASE_EXPIRES_AT
            })
        ).resolves.toBe(true);
        await expect(storedLease()).resolves.toMatchObject({ lease_owner: null });
    });

    it("blocks an active polling connector under its current lease", async () => {
        await repository.tryAcquire(command("000000000414"));

        await expect(
            repository.blockConfiguration(blockCommand("000000000414"))
        ).resolves.toBe(true);
        await expect(storedConnector()).resolves.toMatchObject({
            status: "BLOCKED_CONFIGURATION",
            updated_at: RENEWED_AT,
            version: 2
        });
        await expect(repository.release(releaseCommand("000000000414"))).resolves.toBe(true);
        await expect(repository.tryAcquire(command("000000000415"))).resolves.toBeNull();
    });

    it.each([
        ["stale owner", { workerId: "poller-b" }],
        ["stale token", { leaseToken: "0199037b-6400-7000-8000-000000000499" }],
        ["expired lease", { blockedAt: LEASE_EXPIRES_AT }]
    ] as const)("does not block the connector with a %s", async (_case, overrides) => {
        await repository.tryAcquire(command("000000000416"));

        await expect(
            repository.blockConfiguration({ ...blockCommand("000000000416"), ...overrides })
        ).resolves.toBe(false);
        await expect(storedConnector()).resolves.toMatchObject({
            status: "ACTIVE",
            version: 1
        });
    });

    it("does not overwrite a connector disabled during its lease", async () => {
        await repository.tryAcquire(command("000000000417"));
        await database
            .updateTable("connector_configurations")
            .set({ status: "DISABLED", updated_at: RENEWED_AT })
            .where("id", "=", CONNECTOR_ID)
            .execute();

        await expect(
            repository.blockConfiguration(blockCommand("000000000417"))
        ).resolves.toBe(false);
        await expect(storedConnector()).resolves.toMatchObject({
            status: "DISABLED",
            version: 1
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

    function renewCommand(tokenSuffix: string): Parameters<typeof repository.renew>[0] {
        return {
            connectorId: CONNECTOR_ID,
            leaseExpiresAt: RENEWED_EXPIRES_AT,
            leaseToken: `0199037b-6400-7000-8000-${tokenSuffix}`,
            renewedAt: RENEWED_AT,
            workerId: "poller-a"
        };
    }

    function releaseCommand(tokenSuffix: string): Parameters<typeof repository.release>[0] {
        return {
            connectorId: CONNECTOR_ID,
            leaseToken: `0199037b-6400-7000-8000-${tokenSuffix}`,
            releasedAt: RENEWED_AT,
            workerId: "poller-a"
        };
    }

    function blockCommand(
        tokenSuffix: string
    ): Parameters<typeof repository.blockConfiguration>[0] {
        return {
            blockedAt: RENEWED_AT,
            connectorId: CONNECTOR_ID,
            leaseToken: `0199037b-6400-7000-8000-${tokenSuffix}`,
            workerId: "poller-a"
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

    async function storedConnector() {
        return database
            .selectFrom("connector_configurations")
            .select(["status", "updated_at", "version"])
            .where("id", "=", CONNECTOR_ID)
            .executeTakeFirstOrThrow();
    }
});
