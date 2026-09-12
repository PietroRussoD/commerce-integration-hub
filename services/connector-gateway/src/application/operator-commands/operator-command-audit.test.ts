import { describe, expect, it, vi } from "vitest";

import {
    createOperatorCommandAuditor,
    type OperatorCommandAuditRepository
} from "./operator-command-audit.js";

const COMMAND_ID = "0199037b-6400-7000-8000-000000000821";
const DELIVERY_ID = "0199037b-6400-7000-8000-000000000822";
const IDEMPOTENCY_KEY = "0199037b-6400-7000-8000-000000000823";
const OCCURRED_AT = new Date("2026-09-12T09:00:00.000Z");

describe("operator command auditor", () => {
    it("records a validated delivery replay reservation", async () => {
        const repository = repositoryStub();
        repository.reserve.mockResolvedValue({ commandId: COMMAND_ID, status: "CREATED" });
        const auditor = createAuditor(repository);

        await expect(auditor.reserveDeliveryReplay(request())).resolves.toEqual({
            commandId: COMMAND_ID,
            status: "CREATED"
        });
        expect(repository.reserve).toHaveBeenCalledWith({
            action: "DELIVERY_REPLAY",
            actorSubject: "operator-42",
            commandId: COMMAND_ID,
            deliveryId: DELIVERY_ID,
            idempotencyKey: IDEMPOTENCY_KEY,
            occurredAt: OCCURRED_AT,
            reason: "Retry after the upstream incident was resolved"
        });
    });

    it("rejects malformed privileged command input before persistence", async () => {
        const repository = repositoryStub();
        const auditor = createAuditor(repository);

        await expect(
            auditor.reserveDeliveryReplay({ ...request(), reason: "   " })
        ).rejects.toThrow("reason must be non-blank");
        await expect(
            auditor.reserveDeliveryReplay({ ...request(), idempotencyKey: "not-a-uuid" })
        ).rejects.toThrow("idempotencyKey must be a canonical UUID");
        expect(repository.reserve).not.toHaveBeenCalled();
    });

    it("records terminal outcomes with an explicit error contract", async () => {
        const repository = repositoryStub();
        repository.complete.mockResolvedValue({ status: "COMPLETED" });
        const auditor = createAuditor(repository);

        await expect(
            auditor.complete({ commandId: COMMAND_ID, outcome: "SUCCEEDED" })
        ).resolves.toEqual({ status: "COMPLETED" });
        expect(repository.complete).toHaveBeenCalledWith({
            commandId: COMMAND_ID,
            errorCode: null,
            occurredAt: OCCURRED_AT,
            outcome: "SUCCEEDED"
        });
        await expect(
            auditor.complete({ commandId: COMMAND_ID, outcome: "FAILED" })
        ).rejects.toThrow("FAILED operator commands require a bounded errorCode");
        await expect(
            auditor.complete({
                commandId: COMMAND_ID,
                errorCode: "UNEXPECTED_FAILURE",
                outcome: "SUCCEEDED"
            })
        ).rejects.toThrow("SUCCEEDED operator commands cannot include an errorCode");
    });
});

function createAuditor(repository: ReturnType<typeof repositoryStub>) {
    return createOperatorCommandAuditor({
        clock: () => OCCURRED_AT,
        createCommandId: () => COMMAND_ID,
        repository
    });
}

function repositoryStub() {
    return {
        complete: vi.fn<OperatorCommandAuditRepository["complete"]>(),
        reserve: vi.fn<OperatorCommandAuditRepository["reserve"]>()
    };
}

function request() {
    return {
        actorSubject: "operator-42",
        deliveryId: DELIVERY_ID,
        idempotencyKey: IDEMPOTENCY_KEY,
        reason: "Retry after the upstream incident was resolved"
    };
}
