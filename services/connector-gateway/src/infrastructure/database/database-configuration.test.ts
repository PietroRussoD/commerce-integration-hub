import { describe, expect, it } from "vitest";

import { loadDatabaseConfiguration } from "./database-configuration.js";

describe("loadDatabaseConfiguration", () => {
    it("loads the connection string and default pool size", () => {
        expect(
            loadDatabaseConfiguration({ DATABASE_URL: " postgres://gateway:secret@localhost/gateway " })
        ).toEqual({
            connectionTimeoutMilliseconds: 2_000,
            connectionString: "postgres://gateway:secret@localhost/gateway",
            maxPoolSize: 10
        });
    });

    it("loads an explicit pool size", () => {
        expect(
            loadDatabaseConfiguration({
                DATABASE_URL: "postgres://gateway:secret@localhost/gateway",
                DATABASE_CONNECTION_TIMEOUT_MILLISECONDS: "5000",
                DATABASE_MAX_POOL_SIZE: "20"
            })
        ).toEqual({
            connectionTimeoutMilliseconds: 5_000,
            connectionString: "postgres://gateway:secret@localhost/gateway",
            maxPoolSize: 20
        });
    });

    it.each([{}, { DATABASE_URL: " " }])("rejects a missing connection string", (environment) => {
        expect(() => loadDatabaseConfiguration(environment)).toThrow(
            "DATABASE_URL must be configured"
        );
    });

    it.each(["1.5", "ten", "-1"])("rejects non-integer pool size %s", (poolSize) => {
        expect(() =>
            loadDatabaseConfiguration({
                DATABASE_URL: "postgres://gateway:secret@localhost/gateway",
                DATABASE_MAX_POOL_SIZE: poolSize
            })
        ).toThrow("DATABASE_MAX_POOL_SIZE must be an integer");
    });

    it.each(["1.5", "ten", "-1"])(
        "rejects non-integer connection timeout %s",
        (connectionTimeout) => {
            expect(() =>
                loadDatabaseConfiguration({
                    DATABASE_CONNECTION_TIMEOUT_MILLISECONDS: connectionTimeout,
                    DATABASE_URL: "postgres://gateway:secret@localhost/gateway"
                })
            ).toThrow("DATABASE_CONNECTION_TIMEOUT_MILLISECONDS must be an integer");
        }
    );

    it.each(["0", "51"])("rejects out-of-range pool size %s", (poolSize) => {
        expect(() =>
            loadDatabaseConfiguration({
                DATABASE_URL: "postgres://gateway:secret@localhost/gateway",
                DATABASE_MAX_POOL_SIZE: poolSize
            })
        ).toThrow("DATABASE_MAX_POOL_SIZE must be between 1 and 50");
    });

    it.each(["99", "30001"])(
        "rejects out-of-range connection timeout %s",
        (connectionTimeout) => {
            expect(() =>
                loadDatabaseConfiguration({
                    DATABASE_CONNECTION_TIMEOUT_MILLISECONDS: connectionTimeout,
                    DATABASE_URL: "postgres://gateway:secret@localhost/gateway"
                })
            ).toThrow(
                "DATABASE_CONNECTION_TIMEOUT_MILLISECONDS must be between 100 and 30000"
            );
        }
    );
});
