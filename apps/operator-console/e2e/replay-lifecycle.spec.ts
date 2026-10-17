import { expect, test, type Page, type Request } from "@playwright/test";

import { deliveryDetail, deliveryId, deliveryPage } from "./fixtures";

// Requests, JWT claims and responses are synthetic; no backend commands are sent.
test("Gateway list does not keep another session's rows while a replacement token loads", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/gateway-api/api/v1/operator/deliveries?**", async (route) => {
    const replacement = route.request().headers()["authorization"] === `Bearer ${token("second")}`;
    if (replacement) await gate;
    await route.fulfill({ status: 200, json: {
      ...deliveryPage,
      items: deliveryPage.items.map((item) => ({ ...item, externalEventId: replacement ? "SECOND-SESSION-EVENT" : "FIRST-SESSION-EVENT" })),
    } });
  });
  try {
    await page.goto("/deliveries");
    await applyToken(page, token("first"));
    await expect(page.getByRole("link", { name: "FIRST-SESSION-EVENT" })).toBeVisible();
    await applyToken(page, token("second"));
    await expect(page.getByRole("status", { name: "Loading deliveries" })).toBeVisible();
    await expect(page.getByRole("link", { name: "FIRST-SESSION-EVENT" })).toHaveCount(0);
    release();
    await expect(page.getByRole("link", { name: "SECOND-SESSION-EVENT" })).toBeVisible();
  } finally { release(); }
});

for (const failure of [false, true]) {
  test(`pending replay survives dialog reopening and navigation (${failure ? "failure" : "accepted"})`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    const mock = await mockGateway(page, failure);
    try {
      await page.goto(`/deliveries/${deliveryId}`);
      await applyToken(page, token("first"));
      await startReplay(page);
      await expect.poll(() => mock.posts.length).toBe(1);
      await page.keyboard.press("Escape");
      await expect(pendingNotice(page)).toContainText("does not cancel");
      await expect(pendingNotice(page)).toContainText("Reloading or leaving");
      await page.getByRole("button", { name: "View pending request", exact: true }).click();
      await assertPendingDialog(page);
      await expect(page.getByLabel("Reason")).toHaveValue("Synthetic recovery check");
      await page.keyboard.press("Escape");
      await page.getByRole("link", { name: "Simulator", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Simulator" })).toBeVisible();
      await expect(pendingNotice(page)).toContainText("awaiting a Gateway response: 1");
      await page.getByRole("link", { name: "Deliveries", exact: true }).click();
      await page.getByRole("link", { name: "DELIVERY-E2E-001" }).click();
      await page.getByRole("button", { name: "View pending request", exact: true }).click();
      await assertPendingDialog(page);
      expect(mock.posts).toHaveLength(1);
      mock.release();
      if (failure) {
        await expect(page.getByRole("alert")).toContainText("Only exhausted deliveries");
        await expect(page.getByRole("button", { name: "Confirm request" })).toBeDisabled();
      } else {
        // Completion invalidates the detail even though its original page unmounted.
        await expect(page.locator("section[aria-labelledby='delivery-outcome-heading']").getByText("Received", { exact: true })).toBeVisible();
        await expect(page.getByRole("button", { name: "Request a new send attempt", exact: true, includeHidden: true })).toBeDisabled();
      }
      expect(mock.posts).toHaveLength(1);
      expect(mock.posts[0].headers()["authorization"]).toBe(`Bearer ${token("first")}`);
      expect(mock.posts[0].postDataJSON()).toEqual({ reason: "Synthetic recovery check" });
    } finally { mock.release(); }
  });
}

for (const remove of [false, true]) {
  test(`pending replay survives token ${remove ? "removal" : "replacement"} without leaking its reason`, async ({ page }) => {
    const mock = await mockGateway(page);
    try {
      await page.goto(`/deliveries/${deliveryId}`);
      await applyToken(page, token("first"));
      await startReplay(page);
      await expect.poll(() => mock.posts.length).toBe(1);
      await page.keyboard.press("Escape");
      if (remove) {
        await page.getByRole("button", { name: "Manage operator access token" }).click();
        await page.getByRole("button", { name: "Remove token" }).click();
        await page.keyboard.press("Escape");
        await expect(page.getByRole("alert")).toContainText("An operator access token is required");
      } else {
        await applyToken(page, token("second"));
      }
      await expect(pendingNotice(page)).toContainText("does not cancel");
      await expect(pendingNotice(page)).not.toContainText(deliveryId);
      await expect(pendingNotice(page)).not.toContainText("Synthetic recovery check");
      if (remove) await applyToken(page, token("second"));
      await page.getByRole("button", { name: "View pending request", exact: true }).click();
      await assertPendingDialog(page);
      await expect(page.getByLabel("Reason")).toHaveValue("");
      await page.keyboard.press("Escape");
      const readsBefore = mock.detailReads.filter((request) => request.headers()["authorization"] === `Bearer ${token("second")}`).length;
      mock.release();
      await expect(pendingNotice(page)).toHaveCount(0);
      // The original response neither uses the new token nor invalidates its data.
      expect(mock.detailReads.filter((request) => request.headers()["authorization"] === `Bearer ${token("second")}`)).toHaveLength(readsBefore);
      expect(mock.posts).toHaveLength(1);
      expect(mock.posts[0].headers()["authorization"]).toBe(`Bearer ${token("first")}`);
    } finally { mock.release(); }
  });
}

function pendingNotice(page: Page) {
  return page.getByRole("status").filter({ hasText: "Replay requests awaiting a Gateway response" });
}

async function mockGateway(page: Page, failure = false) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const posts: Request[] = [];
  const detailReads: Request[] = [];
  let completed = false;
  await page.route("**/gateway-api/api/v1/operator/deliveries?**", async (route) => {
    await route.fulfill({ status: 200, json: deliveryPage });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
    detailReads.push(route.request());
    await route.fulfill({ status: 200, json: { ...deliveryDetail, status: completed ? "RECEIVED" : "EXHAUSTED" } });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    posts.push(route.request());
    await gate;
    completed = true;
    await route.fulfill(failure
      ? { status: 409, json: { type: "urn:problem:delivery-not-replayable", title: "Delivery replay rejected", status: 409, detail: "Synthetic rejection" } }
      : { status: 202, json: { commandId: "26998c94-b78f-4e33-8a24-47a8b353b9b8", idempotent: false, outcome: "REPLAYED" } });
  });
  return { posts, detailReads, release };
}

async function applyToken(page: Page, value: string) {
  await page.getByRole("button", { name: /^(Set|Manage) operator access token$/ }).click();
  await page.getByLabel("Access token", { exact: true }).fill(value);
  await page.getByRole("button", { name: "Use token" }).click();
}

async function startReplay(page: Page) {
  await page.getByRole("button", { name: "Request a new send attempt", exact: true }).click();
  await page.getByLabel("Reason").fill("Synthetic recovery check");
  await page.getByRole("button", { name: "Confirm request" }).click();
}

async function assertPendingDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "Request a new send attempt" });
  await expect(dialog.getByRole("status")).toContainText("Waiting for the Gateway response");
  await expect(dialog.getByLabel("Reason")).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Confirm request" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close send attempt dialog" })).toBeFocused();
}

function token(subject: string) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode({ sub: `synthetic-${subject}`, exp: 2_000_000_000, groups: ["platform-admin"] })}.signature`;
}
