import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildApplication } from "../src/app.js";

const outputPath = resolve(process.cwd(), "../../docs/contracts/connector-gateway.openapi.json");
const checkOnly = process.argv.includes("--check");

const application = buildApplication({
    marketplaceAWebhook: {
        authenticate: () => ({ authenticated: false, reason: "unknown_key" }),
        receiveInboundDelivery: () =>
            Promise.resolve({ deliveryId: "00000000-0000-0000-0000-000000000000", outcome: "CREATED" as const })
    },
    operatorDeliveries: {
        authorization: {
            enabled: true,
            verifyToken: () => Promise.resolve({ authenticated: false })
        },
        getDelivery: () => Promise.resolve(null),
        listDeliveries: () => Promise.resolve({ items: [], nextCursor: null }),
        replayDelivery: () =>
            Promise.resolve({
                commandId: "00000000-0000-0000-0000-000000000000",
                outcome: "REPLAYED" as const
            })
    }
});

await application.ready();

try {
    const document = `${JSON.stringify(application.swagger(), null, 2)}\n`;

    if (checkOnly) {
        const committed = await readFile(outputPath, "utf8");
        if (committed !== document) {
            throw new Error(`OpenAPI document is stale: ${outputPath}`);
        }
    } else {
        await mkdir(resolve(outputPath, ".."), { recursive: true });
        await writeFile(outputPath, document, "utf8");
    }
} finally {
    await application.close();
}
