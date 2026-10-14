import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import { createPool } from "./database.js";

const configuration = {
    connectionString: "postgresql://gateway:unused@127.0.0.1:1/gateway",
    connectionTimeoutMilliseconds: 100,
    maxPoolSize: 1
};

describe("the connection pool", () => {
    let pool: Pool | undefined;

    afterEach(async () => {
        await pool?.end();
        pool = undefined;
    });

    it("reports an error on an idle client to the handler it was given", () => {
        const onPoolError = vi.fn();
        pool = createPool(configuration, onPoolError);
        const error = Object.assign(new Error("terminating connection due to administrator command"), {
            code: "57P01"
        });

        pool.emit("error", error);

        expect(onPoolError).toHaveBeenCalledExactlyOnceWith(error);
    });

    it("survives an error on an idle client even when no handler was given", () => {
        pool = createPool(configuration);

        // Without a listener, emitting `error` throws: the unhandled error that
        // used to end the process when the database closed a connection.
        expect(() => pool?.emit("error", new Error("connection terminated"))).not.toThrow();
    });

    it("survives an error on a client that is checked out between two queries", () => {
        const onPoolError = vi.fn();
        pool = createPool(configuration, onPoolError);
        // The pool announces each client it connects; a bare emitter stands in for it.
        const client = new EventEmitter() as unknown as PoolClient;
        pool.emit("connect", client);
        const error = new Error("Connection terminated unexpectedly");

        // Without a listener on the client itself this throws, and ends the process.
        expect(() => client.emit("error", error)).not.toThrow();
        expect(onPoolError).toHaveBeenCalledExactlyOnceWith(error);
    });

    it("reports once an error that reaches both the client and the pool", () => {
        const onPoolError = vi.fn();
        pool = createPool(configuration, onPoolError);
        const client = new EventEmitter() as unknown as PoolClient;
        pool.emit("connect", client);
        const error = new Error("terminating connection due to administrator command");

        // An idle client: it emits the error, and the pool re-emits the same error.
        client.emit("error", error);
        pool.emit("error", error, client);

        expect(onPoolError).toHaveBeenCalledTimes(1);
    });
});
