import { describe, expect, it } from "vitest";

import {
    assertPollingLeaseExceedsRequestTimeout,
    readErpBPollingConfiguration
} from "./erp-b-polling-configuration.js";

describe("readErpBPollingConfiguration", () => {
    it.each([{}, { ERP_B_POLLING_ENABLED: "false" }])(
        "keeps polling disabled by default",
        (environment) => {
            expect(readErpBPollingConfiguration(environment)).toEqual({ enabled: false });
        }
    );

    it("loads conservative defaults for enabled polling", () => {
        expect(
            readErpBPollingConfiguration({
                ERP_B_POLLING_ENABLED: "true",
                ERP_B_POLLING_WORKER_ID: "erp-b-poller-1"
            })
        ).toEqual({
            connectorId: "0199037b-6400-7000-8000-000000000002",
            enabled: true,
            intervalMilliseconds: 30_000,
            leaseDurationMilliseconds: 60_000,
            maxPagesPerRun: 10,
            workerId: "erp-b-poller-1"
        });
    });

    it("loads explicit operational bounds", () => {
        expect(
            readErpBPollingConfiguration({
                ERP_B_CONNECTOR_ID: "0199037b-6400-7000-8000-000000000099",
                ERP_B_POLLING_ENABLED: "true",
                ERP_B_POLLING_INTERVAL_MILLISECONDS: "5000",
                ERP_B_POLLING_LEASE_DURATION_MILLISECONDS: "90000",
                ERP_B_POLLING_MAX_PAGES_PER_RUN: "25",
                ERP_B_POLLING_WORKER_ID: "erp-b-poller-2"
            })
        ).toEqual({
            connectorId: "0199037b-6400-7000-8000-000000000099",
            enabled: true,
            intervalMilliseconds: 5_000,
            leaseDurationMilliseconds: 90_000,
            maxPagesPerRun: 25,
            workerId: "erp-b-poller-2"
        });
    });

    it.each(["TRUE", "yes", "1", ""])("rejects enabled value %s", (enabled) => {
        expect(() =>
            readErpBPollingConfiguration({ ERP_B_POLLING_ENABLED: enabled })
        ).toThrow("ERP_B_POLLING_ENABLED must be true or false");
    });

    it.each([undefined, "", " ", "w".repeat(101)])("rejects worker ID %s", (workerId) => {
        expect(() =>
            readErpBPollingConfiguration({
                ERP_B_POLLING_ENABLED: "true",
                ERP_B_POLLING_WORKER_ID: workerId
            })
        ).toThrow("ERP_B_POLLING_WORKER_ID must contain between 1 and 100 characters");
    });

    it.each(["not-a-uuid", "0199037B-6400-7000-8000-000000000099"])(
        "rejects connector ID %s",
        (connectorId) => {
            expect(() =>
                readErpBPollingConfiguration({
                    ERP_B_CONNECTOR_ID: connectorId,
                    ERP_B_POLLING_ENABLED: "true",
                    ERP_B_POLLING_WORKER_ID: "erp-b-poller-1"
                })
            ).toThrow("ERP_B_CONNECTOR_ID must be a canonical UUID");
        }
    );

    it.each([
        ["ERP_B_POLLING_INTERVAL_MILLISECONDS", "99", "100", "300000"],
        ["ERP_B_POLLING_INTERVAL_MILLISECONDS", "300001", "100", "300000"],
        ["ERP_B_POLLING_LEASE_DURATION_MILLISECONDS", "999", "1000", "300000"],
        ["ERP_B_POLLING_LEASE_DURATION_MILLISECONDS", "300001", "1000", "300000"],
        ["ERP_B_POLLING_MAX_PAGES_PER_RUN", "0", "1", "100"],
        ["ERP_B_POLLING_MAX_PAGES_PER_RUN", "101", "1", "100"],
        ["ERP_B_POLLING_MAX_PAGES_PER_RUN", "1.5", "1", "100"]
    ])("rejects %s=%s", (name, value, minimum, maximum) => {
        expect(() =>
            readErpBPollingConfiguration({
                ERP_B_POLLING_ENABLED: "true",
                ERP_B_POLLING_WORKER_ID: "erp-b-poller-1",
                [name]: value
            })
        ).toThrow(`${name} must be an integer between ${minimum} and ${maximum}`);
    });
});

describe("assertPollingLeaseExceedsRequestTimeout", () => {
    it("accepts the minimum request headroom", () => {
        expect(() => assertPollingLeaseExceedsRequestTimeout(10_000, 5_000)).not.toThrow();
    });

    it.each([
        [9_999, 5_000],
        [5_000, 5_000]
    ])("rejects lease %s for timeout %s", (lease, timeout) => {
        expect(() => assertPollingLeaseExceedsRequestTimeout(lease, timeout)).toThrow(
            "ERP_B_POLLING_LEASE_DURATION_MILLISECONDS must exceed ERP_B_TIMEOUT_MILLISECONDS by at least 5000"
        );
    });
});
