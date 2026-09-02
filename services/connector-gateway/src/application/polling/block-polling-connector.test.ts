import { describe, expect, it, vi } from "vitest";

import {
    createBlockPollingConnectorUseCase,
    type PollingConnectorRepository
} from "./block-polling-connector.js";

const CONNECTOR_ID = "0199037b-6400-7000-8000-000000000002";
const LEASE_TOKEN = "0199037b-6400-7000-8000-000000000401";

describe("createBlockPollingConnectorUseCase", () => {
    it("builds a timestamped fenced block command", async () => {
        const blockConfiguration = vi.fn().mockResolvedValue(true);
        const blockConnector = createBlockPollingConnectorUseCase({
            currentTimeMilliseconds: () => Date.parse("2026-09-02T09:00:30.000Z"),
            repository: { blockConfiguration },
            workerId: "poller-a"
        });

        await expect(
            blockConnector({ connectorId: CONNECTOR_ID, leaseToken: LEASE_TOKEN })
        ).resolves.toBe(true);
        expect(blockConfiguration).toHaveBeenCalledWith({
            blockedAt: new Date("2026-09-02T09:00:30.000Z"),
            connectorId: CONNECTOR_ID,
            leaseToken: LEASE_TOKEN,
            workerId: "poller-a"
        });
    });

    it.each(["", " ", "a".repeat(101)])("rejects invalid worker ID %j", (workerId) => {
        expect(() =>
            createBlockPollingConnectorUseCase({
                repository: repositoryStub(),
                workerId
            })
        ).toThrow("workerId must contain between 1 and 100 characters");
    });

    it.each([
        ["connectorId", "erp-b", "connectorId must be a canonical UUID"],
        ["leaseToken", "stale-token", "leaseToken must be a canonical UUID"]
    ] as const)("rejects an invalid %s", (field, value, message) => {
        const blockConnector = createBlockPollingConnectorUseCase({
            repository: repositoryStub(),
            workerId: "poller-a"
        });

        expect(() =>
            blockConnector({ connectorId: CONNECTOR_ID, leaseToken: LEASE_TOKEN, [field]: value })
        ).toThrow(message);
    });
});

function repositoryStub(): PollingConnectorRepository {
    return { blockConfiguration: vi.fn().mockResolvedValue(false) };
}
