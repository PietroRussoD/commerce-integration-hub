import { expect, test, type Page } from "@playwright/test";

import { deliveryDetail, deliveryId, deliveryPage } from "./fixtures";

const commandId = "26998c94-b78f-4e33-8a24-47a8b353b9b8";

// All credentials and API responses are synthetic; no real replay is performed.
for (const width of [320, 1440]) {
  for (const outcome of ["REPLAYED", "IN_PROGRESS"] as const) {
    test(`preserves ${outcome} feedback after closing and navigation at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      let status = "EXHAUSTED";
      let posts = 0;
      await page.route("**/gateway-api/api/v1/operator/deliveries?**", async (route) => {
        await route.fulfill({ status: 200, json: { ...deliveryPage, items: deliveryPage.items.map((item) => ({ ...item, status })) } });
      });
      await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
        await route.fulfill({ status: 200, json: { ...deliveryDetail, status } });
      });
      await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
        posts++;
        if (outcome === "REPLAYED") status = "RECEIVED";
        await route.fulfill({ status: 202, json: { commandId, idempotent: false, outcome } });
      });
      await page.goto(`/deliveries/${deliveryId}`);
      await applyToken(page, "first");
      await page.getByRole("button", { name: "Replay delivery", exact: true }).click();
      await page.getByLabel("Reason").fill("Synthetic recovery check");
      await page.getByRole("button", { name: "Confirm replay" }).click();
      const dialog = page.getByRole("dialog", { name: "Replay delivery" });
      await expect(dialog.getByRole("status")).toContainText(commandId);
      await expect(dialog.getByRole("status")).toContainText(outcome === "REPLAYED" ? "was accepted" : "already in progress");
      if (outcome === "REPLAYED") {
        await expect(page.locator("dd").filter({ hasText: /^Received$/ })).toBeVisible();
        await expect(page.getByRole("button", { name: "Replay delivery", exact: true, includeHidden: true })).toHaveCount(0);
      }
      const close = dialog.getByRole("button", { name: "Close replay delivery dialog" });
      await expect(close).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(outcome === "REPLAYED" ? page.getByRole("main") : page.getByRole("button", { name: "Resolve replay request" })).toBeFocused();
      const feedback = page.getByRole("status", { name: "Last confirmed replay response" });
      await expect(feedback).toContainText(commandId);
      await expect(feedback).toContainText(outcome === "REPLAYED" ? "The delivery was requeued" : "Its result and the delivery outcome still need to be confirmed");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

      const navigation = page.getByRole("navigation", { name: "Primary navigation" });
      await navigation.getByRole("link", { name: "Simulator", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Simulator" })).toBeVisible();
      await expect(feedback).toHaveCount(0);
      await navigation.getByRole("link", { name: "Deliveries", exact: true }).click();
      await page.getByRole("link", { name: "DELIVERY-E2E-001" }).click();
      await expect(page).toHaveURL(`/deliveries/${deliveryId}`);
      await expect(page.getByRole("heading", { name: "Delivery details" })).toBeVisible();
      await expect(feedback).toContainText(commandId);
      expect(posts).toBe(1);

      // A renewed token with the same claimed subject starts a fresh session.
      await applyToken(page, "renewed");
      await expect(feedback).toHaveCount(0);
      await expect(page.getByText(commandId, { exact: false })).toHaveCount(0);
      expect(posts).toBe(1);
    });
  }
}

async function applyToken(page: Page, jti: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  await page.getByRole("button", { name: /^(Set|Manage) operator access token$/ }).click();
  await page.getByLabel("Access token", { exact: true }).fill(
    `${encode({ alg: "RS256" })}.${encode({ sub: "synthetic-feedback-admin", exp: 2_000_000_000, groups: ["platform-admin"], jti })}.signature`,
  );
  await page.getByRole("button", { name: "Use token" }).click();
}
