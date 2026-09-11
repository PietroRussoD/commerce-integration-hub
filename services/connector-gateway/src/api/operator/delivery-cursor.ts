import {
    assertInboundDeliveryCursor,
    type InboundDeliveryCursor
} from "../../application/deliveries/list-inbound-deliveries.js";

const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const MAX_CURSOR_LENGTH = 512;

interface DeliveryCursorEnvelope {
    readonly i: string;
    readonly r: string;
    readonly v: 1;
}

export class InvalidDeliveryCursorError extends Error {}

export function encodeDeliveryCursor(cursor: InboundDeliveryCursor): string {
    const envelope: DeliveryCursorEnvelope = {
        i: cursor.deliveryId,
        r: cursor.receivedAt,
        v: 1
    };
    return Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
}

export function decodeDeliveryCursor(encoded: string): InboundDeliveryCursor {
    try {
        if (
            encoded.length === 0 ||
            encoded.length > MAX_CURSOR_LENGTH ||
            !CURSOR_PATTERN.test(encoded)
        ) {
            throw new InvalidDeliveryCursorError();
        }

        const decoded = Buffer.from(encoded, "base64url");
        if (decoded.toString("base64url") !== encoded) {
            throw new InvalidDeliveryCursorError();
        }
        const envelope: unknown = JSON.parse(decoded.toString("utf8"));
        if (!isDeliveryCursorEnvelope(envelope)) {
            throw new InvalidDeliveryCursorError();
        }

        const cursor = { deliveryId: envelope.i, receivedAt: envelope.r };
        assertInboundDeliveryCursor(cursor);
        return cursor;
    } catch {
        throw new InvalidDeliveryCursorError("cursor must be a valid opaque delivery cursor");
    }
}

function isDeliveryCursorEnvelope(value: unknown): value is DeliveryCursorEnvelope {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    return (
        Object.keys(record).length === 3 &&
        record.v === 1 &&
        typeof record.i === "string" &&
        typeof record.r === "string"
    );
}
