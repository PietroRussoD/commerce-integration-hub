import { timingSafeEqual } from "node:crypto";

import Fastify, { type FastifyInstance } from "fastify";

import type { ErpBSimulationScenario } from "./configuration.js";

const CURSOR_PATTERN = /^cursor-([0-9]{1,9})$/;
const CHANGES = [
    {
        changeId: "chg-demo-001",
        currencyCode: "EUR",
        declaredTotal: "39.98",
        orderCode: "ERP-DEMO-001",
        positions: [
            {
                articleNumber: "SKU-BOOK-1",
                positionId: "1",
                pricePerUnit: "19.99",
                units: "2"
            }
        ]
    },
    {
        changeId: "chg-demo-002",
        currencyCode: "JPY",
        declaredTotal: "1000.00",
        orderCode: "ERP-DEMO-002",
        positions: [
            {
                articleNumber: "SKU-POISON-1",
                positionId: "1",
                pricePerUnit: "1000.00",
                units: "1"
            }
        ]
    },
    {
        changeId: "chg-demo-003",
        currencyCode: "GBP",
        declaredTotal: "12.50",
        orderCode: "ERP-DEMO-003",
        positions: [
            {
                articleNumber: "SKU-MUG-1",
                positionId: "1",
                pricePerUnit: "12.50",
                units: "1"
            }
        ]
    }
] as const;

type ErpBChange = (typeof CHANGES)[number];

const CHANGES_BY_SCENARIO = {
    MIXED: CHANGES,
    SUCCESS: [CHANGES[0], CHANGES[2]],
    POISON_ITEM: [CHANGES[1]]
} as const satisfies Record<ErpBSimulationScenario, readonly ErpBChange[]>;

interface ErpBQuery {
    readonly cursor?: string;
    readonly limit: number;
}

export interface ProviderSimulatorOptions {
    readonly erpBApiToken: string;
    readonly erpBScenario?: ErpBSimulationScenario;
    readonly logger?: boolean;
}

export function buildProviderSimulator({
    erpBApiToken,
    erpBScenario = "MIXED",
    logger = false
}: ProviderSimulatorOptions): FastifyInstance {
    const application = Fastify({ logger });
    const changes = CHANGES_BY_SCENARIO[erpBScenario];

    application.get("/health", () => ({ status: "UP" }));
    application.get<{ Querystring: ErpBQuery }>(
        "/erp-b/v1/orders",
        {
            schema: {
                querystring: {
                    type: "object",
                    additionalProperties: false,
                    required: ["limit"],
                    properties: {
                        cursor: { type: "string", minLength: 1, maxLength: 512 },
                        limit: { type: "integer", minimum: 1, maximum: 100 }
                    }
                }
            }
        },
        (request, reply) => {
            if (!isAuthorized(request.headers.authorization, erpBApiToken)) {
                reply.code(401);
                return { error: "unauthorized" };
            }

            const offset = parseCursor(request.query.cursor);
            if (offset === null) {
                reply.code(400);
                return { error: "invalid_cursor" };
            }
            return page(changes, offset, request.query.limit);
        }
    );

    return application;
}

function isAuthorized(authorization: string | undefined, expectedToken: string): boolean {
    const prefix = "Bearer ";
    if (authorization === undefined || !authorization.startsWith(prefix)) {
        return false;
    }
    const actual = Buffer.from(authorization.slice(prefix.length), "utf8");
    const expected = Buffer.from(expectedToken, "utf8");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function parseCursor(cursor: string | undefined): number | null {
    if (cursor === undefined) {
        return 0;
    }
    const match = CURSOR_PATTERN.exec(cursor);
    return match === null ? null : Number(match[1]);
}

function page(changes: readonly ErpBChange[], offset: number, limit: number) {
    const items = changes.slice(offset, offset + limit);
    const nextOffset = items.length === 0 ? offset + 1 : offset + items.length;
    return {
        hasMore: nextOffset < changes.length,
        items,
        nextCursor: `cursor-${nextOffset}`
    };
}
