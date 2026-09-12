import { randomUUID } from "node:crypto";

const ERROR_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,99}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type OperatorCommandAction = "DELIVERY_REPLAY";
export type OperatorCommandOutcome = "FAILED" | "REJECTED" | "SUCCEEDED";

export interface ReserveDeliveryReplayCommand {
    readonly actorSubject: string;
    readonly deliveryId: string;
    readonly idempotencyKey: string;
    readonly reason: string;
}

export interface ReservedOperatorCommand {
    readonly commandId: string;
    readonly status: "CREATED" | "IDEMPOTENT_REPLAY" | "IDEMPOTENCY_CONFLICT";
}

export interface CompleteOperatorCommand {
    readonly commandId: string;
    readonly errorCode?: string;
    readonly outcome: OperatorCommandOutcome;
}

export interface CompletedOperatorCommand {
    readonly status: "COMPLETED" | "IDEMPOTENT_REPLAY" | "OUTCOME_CONFLICT";
}

export interface OperatorCommandAuditRepository {
    complete(command: PersistedOperatorCommandOutcome): Promise<CompletedOperatorCommand>;
    reserve(command: PersistedOperatorCommandRequest): Promise<ReservedOperatorCommand>;
}

export interface PersistedOperatorCommandRequest {
    readonly action: OperatorCommandAction;
    readonly actorSubject: string;
    readonly commandId: string;
    readonly deliveryId: string;
    readonly idempotencyKey: string;
    readonly occurredAt: Date;
    readonly reason: string;
}

export interface PersistedOperatorCommandOutcome {
    readonly commandId: string;
    readonly errorCode: string | null;
    readonly occurredAt: Date;
    readonly outcome: OperatorCommandOutcome;
}

export interface OperatorCommandAuditor {
    complete(command: CompleteOperatorCommand): Promise<CompletedOperatorCommand>;
    reserveDeliveryReplay(
        command: ReserveDeliveryReplayCommand
    ): Promise<ReservedOperatorCommand>;
}

export interface OperatorCommandAuditorDependencies {
    readonly clock?: () => Date;
    readonly createCommandId?: () => string;
    readonly repository: OperatorCommandAuditRepository;
}

export function createOperatorCommandAuditor({
    clock = () => new Date(),
    createCommandId = randomUUID,
    repository
}: OperatorCommandAuditorDependencies): OperatorCommandAuditor {
    return {
        complete: async (command) => {
            assertOperatorCommandUuid(command.commandId, "commandId");
            const errorCode = readErrorCode(command.outcome, command.errorCode);
            return repository.complete({
                commandId: command.commandId,
                errorCode,
                occurredAt: clock(),
                outcome: command.outcome
            });
        },
        reserveDeliveryReplay: async (command) => {
            assertOperatorCommandText(command.actorSubject, "actorSubject", 200);
            assertOperatorCommandUuid(command.deliveryId, "deliveryId");
            assertOperatorCommandUuid(command.idempotencyKey, "idempotencyKey");
            assertOperatorCommandText(command.reason, "reason", 1_000);
            const commandId = createCommandId();
            assertOperatorCommandUuid(commandId, "generated commandId");
            return repository.reserve({
                action: "DELIVERY_REPLAY",
                actorSubject: command.actorSubject,
                commandId,
                deliveryId: command.deliveryId,
                idempotencyKey: command.idempotencyKey,
                occurredAt: clock(),
                reason: command.reason
            });
        }
    };
}

function readErrorCode(outcome: OperatorCommandOutcome, errorCode: string | undefined): string | null {
    if (outcome === "SUCCEEDED") {
        if (errorCode !== undefined) {
            throw new Error("SUCCEEDED operator commands cannot include an errorCode");
        }
        return null;
    }
    if (errorCode === undefined || !ERROR_CODE_PATTERN.test(errorCode)) {
        throw new Error(`${outcome} operator commands require a bounded errorCode`);
    }
    return errorCode;
}

export function assertOperatorCommandUuid(value: string, name: string): void {
    if (!UUID_PATTERN.test(value)) {
        throw new Error(`${name} must be a canonical UUID`);
    }
}

export function assertOperatorCommandText(
    value: string,
    name: string,
    maximumLength: number
): void {
    if (value.length === 0 || value.length > maximumLength || value !== value.trim()) {
        throw new Error(`${name} must be non-blank and at most ${maximumLength} characters`);
    }
}
