import { afterEach, describe, expect, it } from "vitest";

import { buildApplication } from "./app.js";

const applications: ReturnType<typeof buildApplication>[] = [];

afterEach(async () => {
    await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe("health endpoint", () => {
    it("reports that the gateway is running", async () => {
        const application = buildApplication();
        applications.push(application);

        const response = await application.inject({ method: "GET", url: "/health" });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ status: "UP" });
    });
});
