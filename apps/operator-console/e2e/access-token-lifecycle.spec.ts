import { expect, test, type Page } from "@playwright/test";

import { deliveryDetail, deliveryId, deliveryPage, orderPage, searchProjectionStatus } from "./fixtures";

// All JWTs, requests and responses are synthetic; these tests do not call a backend.
for (const view of ["list", "detail"] as const) {
  for (const status of [401, 403]) {
    test(`Gateway ${view} hides cached data on ${status} and recovers with a replacement token`, async ({ page }) => {
      let denied = false;
      let reads = 0;
      const firstToken = token("first");
      await page.route("**/gateway-api/api/v1/operator/deliveries**", async (route) => {
        const isList = route.request().url().includes("?");
        if (isList === (view === "list")) reads++;
        if (denied && isList === (view === "list") && route.request().headers().authorization === `Bearer ${firstToken}`) {
          await route.fulfill({ status, json: { status, detail: "Synthetic denial" } });
        } else {
          await route.fulfill({ json: isList ? deliveryPage : deliveryDetail });
        }
      });
      await page.goto(view === "list" ? "/deliveries" : `/deliveries/${deliveryId}`);
      await applyToken(page, firstToken);
      await expect(page.getByText("DELIVERY-E2E-001", { exact: true })).toBeVisible();
      denied = true;
      const before = reads;
      if (view === "list") await page.getByRole("button", { name: "Refresh deliveries" }).click();
      else {
        // Trigger a stale background read without replacing the cached view.
        await page.clock.install();
        await page.clock.fastForward(16_000);
        await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
      }
      await expect(page.getByRole("alert")).toContainText(`(${status})`);
      await expect(page.getByText("DELIVERY-E2E-001", { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(0);
      await page.waitForTimeout(1_200);
      expect(reads - before).toBe(1);
      await page.getByRole("button", { name: "Set or replace token" }).click();
      await expect(page.getByLabel("Access token", { exact: true })).toBeFocused();
      await page.getByLabel("Access token", { exact: true }).fill(token("replacement"));
      await page.getByRole("button", { name: "Use token" }).click();
      await expect(page.getByText("DELIVERY-E2E-001", { exact: true })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
    });
  }
}

for (const status of [401, 403]) {
  test(`Core ${status} offers a working credential replacement`, async ({ page }) => {
    await page.route("**/api/v1/operator/**", async (route) => {
      const accepted = route.request().headers().authorization === `Bearer ${token("core")}`;
      await route.fulfill(accepted
        ? { json: route.request().url().includes("search/status") ? searchProjectionStatus : orderPage }
        : { status, json: { status, detail: "Synthetic denial" } });
    });
    await page.goto("/orders");
    await page.getByRole("button", { name: "Set or replace token" }).first().click();
    await expect(page.getByLabel("Access token", { exact: true })).toBeFocused();
    await page.getByLabel("Access token", { exact: true }).fill(token("core"));
    await page.getByRole("button", { name: "Use token" }).click();
    await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
  });
}

test("expiry during an in-flight replay isolates the late response and reload forgets the replacement token", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.clock.install();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let posts = 0;
  let authorization: string | undefined;
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", (route) => route.fulfill({ json: deliveryDetail }));
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    posts++;
    authorization = route.request().headers().authorization;
    await gate;
    await route.fulfill({ status: 202, json: { commandId: "26998c94-b78f-4e33-8a24-47a8b353b9b8", idempotent: false, outcome: "REPLAYED" } });
  });
  try {
    await page.goto(`/deliveries/${deliveryId}`);
    const expires = await page.evaluate(() => Math.floor(Date.now() / 1_000) + 60);
    const expiring = token("expiring", expires);
    await applyToken(page, expiring);
    await page.getByRole("button", { name: "Request a new send attempt", exact: true }).click();
    await page.getByLabel("Reason").fill("Synthetic expiry check");
    await page.getByRole("button", { name: "Confirm request" }).click();
    await expect.poll(() => posts).toBe(1);
    await page.clock.fastForward(60_000);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const notice = page.getByRole("alert").filter({ hasText: "The access token has expired and was removed" });
    await expect(notice).toContainText("Requests already sent are not cancelled");
    await expect(page.getByRole("status").filter({ hasText: "Replay requests awaiting" })).toBeVisible();
    await expect(page.getByRole("navigation").getByRole("link", { name: "Deliveries" })).toHaveCount(0);
    await notice.getByRole("button", { name: "Set or replace token" }).click();
    await expect(page.getByLabel("Access token", { exact: true })).toBeFocused();
    await expect(page.getByText(/Reloading or closing the page removes it/)).toBeVisible();
    await page.getByLabel("Access token", { exact: true }).fill(token("replacement"));
    await page.getByRole("button", { name: "Use token" }).click();
    await expect(page.getByText("DELIVERY-E2E-001", { exact: true })).toBeVisible();
    release();
    await expect(page.getByRole("status").filter({ hasText: "Replay requests awaiting" })).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Last confirmed replay response" })).toHaveCount(0);
    expect(posts).toBe(1);
    expect(authorization).toBe(`Bearer ${expiring}`);
    const storage = await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)]);
    for (const value of storage) expect(value).not.toContain(token("replacement"));
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("An operator access token is required");
    await expect(page.getByRole("button", { name: "Set operator access token" })).toBeVisible();
  } finally { release(); }
});

for (const status of [401, 403]) {
  test(`replay ${status} opens token recovery without stacking modal dialogs`, async ({ page }) => {
    let posts = 0;
    await page.route("**/gateway-api/api/v1/operator/deliveries/*", (route) => route.fulfill({ json: deliveryDetail }));
    await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
      posts++;
      await route.fulfill({ status, json: { status, detail: "Synthetic denial" } });
    });
    await page.goto(`/deliveries/${deliveryId}`);
    await applyToken(page, token("admin"));
    await page.getByRole("button", { name: "Request a new send attempt", exact: true }).click();
    await page.getByLabel("Reason").fill("Synthetic authorization check");
    await page.getByRole("button", { name: "Confirm request" }).click();
    await expect(page.getByRole("alert")).toContainText(`(${status})`);
    await expect(page.getByRole("button", { name: "Confirm request" })).toBeDisabled();
    await page.getByRole("button", { name: "Set or replace token" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page.getByLabel("Access token", { exact: true })).toBeFocused();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Request a new send attempt", exact: true })).toBeFocused();
    expect(posts).toBe(1);
  });
}

function token(subject: string, expires = 2_000_000_000) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode({ sub: `synthetic-${subject}`, exp: expires, groups: ["platform-admin"] })}.signature`;
}

async function applyToken(page: Page, value: string) {
  await page.getByRole("button", { name: /^(Set|Manage) operator access token$/ }).click();
  await page.getByLabel("Access token", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Use token" }).click();
}

test("token claims and memory policy remain readable in Italian at 320px", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/gateway-api/api/v1/operator/deliveries?**", (route) => route.fulfill({ json: deliveryPage }));
  await page.goto("/deliveries");
  await applyToken(page, token("italian-claims"));
  await page.getByRole("button", { name: "Italian" }).click();
  await page.getByRole("button", { name: "Gestisci token di accesso operatore" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Soggetto dichiarato")).toBeVisible();
  await expect(dialog.getByText("synthetic-italian-claims")).toBeVisible();
  await expect(dialog.getByText("platform-admin", { exact: true })).toBeVisible();
  await expect(dialog.locator("time")).toHaveAttribute("datetime", new Date(2_000_000_000_000).toISOString());
  await expect(dialog.getByText(/Il token resta solo nella memoria/)).toBeVisible();
  await expect(dialog.getByText(/Ogni servizio verifica firma e permessi/)).toBeVisible();
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await dialog.screenshot({ path: testInfo.outputPath("token-claims-it-320.png") });
});
