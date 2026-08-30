import { describe, expect, it } from "vitest";

import {
    assertLeaseExceedsForwardingTimeout,
    readDeliveryWorkerConfiguration
} from "./delivery-worker-configuration.js";

describe("readDeliveryWorkerConfiguration", () => {
    it.each([{}, { DELIVERY_WORKER_ENABLED: "false" }])(
        "keeps the worker disabled by default",
        (environment) => {
            expect(readDeliveryWorkerConfiguration(environment)).toEqual({ enabled: false });
        }
    );

    it("loads bounded defaults for an enabled worker", () => {
        expect(
            readDeliveryWorkerConfiguration({
                DELIVERY_WORKER_ENABLED: "true",
                DELIVERY_WORKER_ID: "gateway-worker-1"
            })
        ).toEqual({
            batchSize: 5,
            enabled: true,
            intervalMilliseconds: 2_000,
            leaseDurationMilliseconds: 60_000,
            workerId: "gateway-worker-1"
        });
    });

    it("loads explicit operational bounds", () => {
        expect(
            readDeliveryWorkerConfiguration({
                DELIVERY_WORKER_BATCH_SIZE: "10",
                DELIVERY_WORKER_ENABLED: "true",
                DELIVERY_WORKER_ID: "gateway-worker-2",
                DELIVERY_WORKER_INTERVAL_MILLISECONDS: "5000",
                DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS: "90000"
            })
        ).toEqual({
            batchSize: 10,
            enabled: true,
            intervalMilliseconds: 5_000,
            leaseDurationMilliseconds: 90_000,
            workerId: "gateway-worker-2"
        });
    });

    it.each(["TRUE", "yes", "1", ""])("rejects enabled value %s", (enabled) => {
        expect(() =>
            readDeliveryWorkerConfiguration({ DELIVERY_WORKER_ENABLED: enabled })
        ).toThrow("DELIVERY_WORKER_ENABLED must be true or false");
    });

    it.each([undefined, "", " ", "w".repeat(101)])("rejects worker ID %s", (workerId) => {
        expect(() =>
            readDeliveryWorkerConfiguration({
                DELIVERY_WORKER_ENABLED: "true",
                DELIVERY_WORKER_ID: workerId
            })
        ).toThrow("DELIVERY_WORKER_ID must contain between 1 and 100 characters");
    });

    it.each([
        ["DELIVERY_WORKER_BATCH_SIZE", "0", "1", "100"],
        ["DELIVERY_WORKER_BATCH_SIZE", "101", "1", "100"],
        ["DELIVERY_WORKER_INTERVAL_MILLISECONDS", "99", "100", "60000"],
        ["DELIVERY_WORKER_INTERVAL_MILLISECONDS", "60001", "100", "60000"],
        ["DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS", "999", "1000", "300000"],
        ["DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS", "300001", "1000", "300000"],
        ["DELIVERY_WORKER_BATCH_SIZE", "1.5", "1", "100"]
    ])("rejects %s=%s", (name, value, minimum, maximum) => {
        expect(() =>
            readDeliveryWorkerConfiguration({
                DELIVERY_WORKER_ENABLED: "true",
                DELIVERY_WORKER_ID: "gateway-worker-1",
                [name]: value
            })
        ).toThrow(`${name} must be an integer between ${minimum} and ${maximum}`);
    });
});

describe("assertLeaseExceedsForwardingTimeout", () => {
    it("accepts a lease longer than the HTTP timeout", () => {
        expect(() => assertLeaseExceedsForwardingTimeout(60_000, 5_000)).not.toThrow();
    });

    it.each([
        [5_000, 5_000],
        [4_999, 5_000]
    ])("rejects lease %s for timeout %s", (lease, timeout) => {
        expect(() => assertLeaseExceedsForwardingTimeout(lease, timeout)).toThrow(
            "DELIVERY_WORKER_LEASE_DURATION_MILLISECONDS must exceed INTEGRATION_CORE_TIMEOUT_MILLISECONDS"
        );
    });
});
