import { createHmac, randomUUID } from "node:crypto";

const gatewayUrl = process.env.GATEWAY_URL ?? "http://localhost:8081";
const keyId = "local-key";
const secret = Buffer.from("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "base64");
const timestamp = Math.floor(Date.now() / 1_000).toString();
const externalEventId = `local-replay-${randomUUID()}`;
const payload = JSON.stringify({
    eventId: externalEventId,
    eventType: "order.created",
    order: {
        orderNumber: externalEventId,
        currency: "EUR",
        totalCents: 3998,
        lines: [
            {
                lineNumber: "1",
                productCode: "SKU-REPLAY-DEMO",
                quantity: 2,
                unitPriceCents: 1999
            }
        ]
    }
});
const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(payload)
    .digest("hex");

const response = await fetch(`${gatewayUrl}/providers/marketplace-a/v1/order-webhooks`, {
    body: payload,
    headers: {
        "content-type": "application/json",
        "x-webhook-key-id": keyId,
        "x-webhook-signature": `v1=${signature}`,
        "x-webhook-timestamp": timestamp
    },
    method: "POST"
});
const responseBody = (await response.json()) as { deliveryId?: string; detail?: string };

if (!response.ok || responseBody.deliveryId === undefined) {
    throw new Error(`Webhook rejected (${response.status}): ${responseBody.detail ?? "unknown error"}`);
}

process.stdout.write(`deliveryId=${responseBody.deliveryId}\n`);
process.stdout.write(`eventId=${externalEventId}\n`);
