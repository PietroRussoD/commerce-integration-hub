import { describe, expect, it, vi } from "vitest";

import {
    evaluateDatabaseReadiness,
    KyselyDatabaseReadiness
} from "./kysely-database-readiness.js";

const executeSql = vi.hoisted(() => vi.fn());

vi.mock("kysely", () => ({
    sql: () => ({ execute: executeSql })
}));

describe("evaluateDatabaseReadiness", () => {
    it("reports a successful probe as ready", async () => {
        await expect(
            evaluateDatabaseReadiness(() => Promise.resolve({ rows: [{ value: 1 }] }))
        ).resolves.toBe(true);
    });

    it("fails closed without exposing the database error", async () => {
        await expect(
            evaluateDatabaseReadiness(() => Promise.reject(new Error("connection details")))
        ).resolves.toBe(false);
    });
});

describe("KyselyDatabaseReadiness", () => {
    it.each([
        [() => Promise.resolve({}), true],
        [() => Promise.reject(new Error("database unavailable")), false]
    ] as const)("returns readiness %s", async (probe, expected) => {
        executeSql.mockReset().mockImplementation(probe);
        const transaction = {
            execute: (callback: (database: unknown) => Promise<void>) => callback({})
        };
        const database = {
            transaction: () => transaction
        };
        const readiness = new KyselyDatabaseReadiness(database as never);

        await expect(readiness.isReady()).resolves.toBe(expected);
        expect(executeSql).toHaveBeenCalledTimes(expected ? 2 : 1);
    });
});
