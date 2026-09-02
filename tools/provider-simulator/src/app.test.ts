import { afterEach, describe, expect, it } from "vitest";

import { buildProviderSimulator } from "./app.js";

const API_TOKEN = "local-test-token";
const applications: ReturnType<typeof buildProviderSimulator>[] = [];

afterEach(async () => {
    await Promise.all(applications.splice(0).map((application) => application.close()));
});

describe("provider simulator", () => {
    it("exposes liveness without provider authentication", async () => {
        const application = createApplication();
        const response = await application.inject({ method: "GET", url: "/health" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: "UP" });
    });

    it.each([undefined, "Bearer wrong-token", API_TOKEN])(
        "rejects invalid authorization %s",
        async (authorization) => {
            const application = createApplication();
            const headers = authorization === undefined ? {} : { authorization };
            const response = await application.inject({
                headers,
                method: "GET",
                url: "/erp-b/v1/orders?limit=2"
            });

            expect(response.statusCode).toBe(401);
            expect(response.json()).toEqual({ error: "unauthorized" });
        }
    );

    it("serves deterministic pages and an advancing idle cursor", async () => {
        const application = createApplication();

        const first = await requestPage(application, "/erp-b/v1/orders?limit=2");
        expect(first).toMatchObject({ hasMore: true, nextCursor: "cursor-2" });
        expect(first.items).toHaveLength(2);
        expect(first.items[0]?.changeId).toBe("chg-demo-001");
        expect(first.items[1]?.currencyCode).toBe("JPY");

        const second = await requestPage(
            application,
            "/erp-b/v1/orders?limit=2&cursor=cursor-2"
        );
        expect(second).toMatchObject({ hasMore: false, nextCursor: "cursor-3" });
        expect(second.items.map((item) => item.changeId)).toEqual(["chg-demo-003"]);

        await expect(
            requestPage(application, "/erp-b/v1/orders?limit=2&cursor=cursor-3")
        ).resolves.toEqual({ hasMore: false, items: [], nextCursor: "cursor-4" });
    });

    it("rejects malformed or unsupported query parameters", async () => {
        const application = createApplication();
        const invalidCursor = await application.inject({
            headers: authorization(),
            method: "GET",
            url: "/erp-b/v1/orders?limit=2&cursor=unknown"
        });
        expect(invalidCursor.statusCode).toBe(400);
        expect(invalidCursor.json()).toEqual({ error: "invalid_cursor" });

        const invalidLimit = await application.inject({
            headers: authorization(),
            method: "GET",
            url: "/erp-b/v1/orders?limit=101"
        });
        expect(invalidLimit.statusCode).toBe(400);
    });
});

function createApplication() {
    const application = buildProviderSimulator({ erpBApiToken: API_TOKEN });
    applications.push(application);
    return application;
}

function authorization() {
    return { authorization: `Bearer ${API_TOKEN}` };
}

async function requestPage(application: ReturnType<typeof buildProviderSimulator>, url: string) {
    const response = await application.inject({
        headers: authorization(),
        method: "GET",
        url
    });
    expect(response.statusCode).toBe(200);
    return response.json<{
        readonly hasMore: boolean;
        readonly items: readonly { readonly changeId: string; readonly currencyCode: string }[];
        readonly nextCursor: string;
    }>();
}
