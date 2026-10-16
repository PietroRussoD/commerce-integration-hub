import { expect, test, type Request } from "@playwright/test";

import { receiveOrderResponse } from "./fixtures";

// Synthetic orders and intercepted API responses: no backend ingestion is performed.
for (const [width, locale, fails] of [[1440, "en", false], [768, "en", true], [320, "it", false]] as const) {
  test(`simulator preserves a single pending submission and its ${fails ? "error" : "result"} at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const requests: Request[] = [];
    await page.route("**/api/v1/orders", async (route) => {
      requests.push(route.request());
      const request = route.request().postDataJSON();
      const pendingSubmission = requests.length === 2;
      if (pendingSubmission) await gate;
      await route.fulfill(pendingSubmission && fails ? {
        status: 400, contentType: "application/problem+json",
        json: { type: "urn:problem:request-validation", title: "Request validation failed", status: 400, detail: "Synthetic rejected quantity", instance: "/api/v1/orders", code: "REQUEST_VALIDATION_FAILED", errors: [{ field: "items[0].quantity", message: "Synthetic rejected quantity" }] },
      } : { status: 201, json: { ...receiveOrderResponse, externalId: request.externalId } });
    });
    try {
      await page.goto("/simulator");
      if (locale === "it") await page.getByRole("button", { name: "Italian" }).click();
      const key = page.getByLabel(locale === "it" ? "Chiave API dell'origine" : "Source API key", { exact: true });
      const externalId = page.getByLabel(locale === "it" ? "ID ordine esterno" : "External order ID", { exact: true });
      const quantity = page.getByLabel(locale === "it" ? "Quantità" : "Quantity", { exact: true });
      const submit = page.getByRole("button", { name: locale === "it" ? "Invia ordine" : "Submit order", exact: true });
      const fresh = page.getByRole("button", { name: locale === "it" ? "Nuovo ordine" : "Fresh order", exact: true });
      await key.fill("synthetic-source.secret");
      await externalId.fill("SYNTHETIC-BASELINE");
      await submit.click();
      await expect(page.getByRole("status")).toContainText(locale === "it" ? "Ordine creato" : "Order created");
      await fresh.click();
      const sentId = await externalId.inputValue();
      // Two submits in one browser task must still produce one request.
      await page.locator("form").evaluate((form: HTMLFormElement) => { form.requestSubmit(); form.requestSubmit(); });
      await expect.poll(() => requests.length).toBe(2);
      await expect(page.getByRole("status")).toContainText(locale === "it" ? "Campi e scenari" : "Fields and scenarios");
      await expect(page.locator("form")).toHaveAttribute("aria-busy", "true");
      await expect(key).toBeDisabled();
      await expect(externalId).toBeDisabled();
      await expect(quantity).toBeDisabled();
      const scenarios = page.getByRole("group", { name: locale === "it" ? "Scenari di simulazione" : "Simulation scenarios" });
      for (const scenario of await scenarios.getByRole("button").all()) await expect(scenario).toBeDisabled();
      await page.locator("form").evaluate((form: HTMLFormElement) => form.requestSubmit());
      expect(requests).toHaveLength(2);
      release();
      const response = page.getByRole(fails ? "alert" : "status");
      await expect(response).toContainText(sentId);
      await expect(submit).toBeEnabled();
      if (fails) await expect(quantity).toHaveAttribute("aria-invalid", "true");
      await quantity.fill("3");
      await expect(response).toContainText(locale === "it" ? "La bozza è stata modificata" : "The draft has changed");
      await expect(response.locator("dd").filter({ hasText: /^2$/ })).toBeVisible();
      if (fails) await expect(quantity).toHaveAttribute("aria-invalid", "false");
      await fresh.click();
      await expect(externalId).not.toHaveValue(sentId);
      await expect(response).toContainText(sentId);
      await expect(response).not.toContainText("synthetic-source.secret");
      expect(requests[1].postDataJSON().externalId).toBe(sentId);
      expect(requests[1].headers()["x-source-api-key"]).toBe("synthetic-source.secret");
      expect(requests).toHaveLength(2);
      await response.screenshot({ path: testInfo.outputPath("submitted-order.png") });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { release(); }
  });
}
