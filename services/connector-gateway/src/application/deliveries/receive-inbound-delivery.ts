import type { ReceiveInboundDeliveryCommand } from "./receive-inbound-delivery-command.js";

export type ReceiveInboundDeliveryOutcome =
    | "CREATED"
    | "EQUIVALENT_REPLAY"
    | "PAYLOAD_CONFLICT";

export interface ReceiveInboundDeliveryResult {
    readonly deliveryId: string;
    readonly outcome: ReceiveInboundDeliveryOutcome;
}

export interface InboundDeliveryRepository {
    // Implementations must classify insert, replay, or conflict atomically.
    receive(
        connectorId: string,
        command: ReceiveInboundDeliveryCommand
    ): Promise<ReceiveInboundDeliveryResult>;
}

export interface ReceiveInboundDeliveryDependencies {
    readonly connectorId: string;
    readonly repository: InboundDeliveryRepository;
}

export type ReceiveInboundDeliveryUseCase = (
    command: ReceiveInboundDeliveryCommand
) => Promise<ReceiveInboundDeliveryResult>;

export function createReceiveInboundDeliveryUseCase({
    connectorId,
    repository
}: ReceiveInboundDeliveryDependencies): ReceiveInboundDeliveryUseCase {
    return (command) => repository.receive(connectorId, command);
}
