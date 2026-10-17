import { expect, test, type Page, type Request } from "@playwright/test";

import type { OperatorDeliveryDetail } from "../src/api/connectorGatewayClient";
import { deliveryDetail, deliveryId } from "./fixtures";

const now = new Date("2026-10-16T12:00:00Z");
const future = "2026-10-17T12:00:00Z";
type Case = { name: string; patch: Partial<OperatorDeliveryDetail>; role?: string; reason?: string };
const cases: Case[] = [
  { name: "eligible delivery", patch: {} },
  { name: "read-only operator", patch: {}, role: "operator", reason: "requires the platform-admin role" },
  ...(["RECEIVED", "FORWARDING", "RETRY_WAIT", "DELIVERED", "PERMANENT_FAILURE", "BLOCKED_CONFIGURATION"] as const)
    .map((status) => ({ name: status, patch: { status }, reason: "Only exhausted deliveries" })),
  { name: "disabled connector", patch: { connectorStatus: "DISABLED" }, reason: "connector must be active" },
  { name: "blocked connector", patch: { connectorStatus: "BLOCKED_CONFIGURATION" }, reason: "connector must be active" },
  { name: "missing payload with future retention", patch: { payloadRetained: false }, reason: "original payload is no longer available" },
  { name: "expired retained payload", patch: { payloadExpiresAt: "2026-10-16T11:59:59Z" }, reason: "retention period has expired" },
  { name: "retention boundary", patch: { payloadExpiresAt: now.toISOString() }, reason: "retention period has expired" },
  { name: "unverifiable retention", patch: { payloadExpiresAt: "invalid" }, reason: "retention deadline cannot be verified" },
];

// All APIs and JWT claims are synthetic. Invalid dates deliberately exercise a
// defensive UI path outside the Gateway's date-time contract.
for (const scenario of cases) {
  test(`new-send eligibility: ${scenario.name}`, async ({ page }) => {
    const mock = await setup(page, scenario.patch);
    await applyToken(page, scenario.role ?? "platform-admin");
    const section = page.getByRole("region", { name: "New send attempt" });
    const trigger = section.getByRole("button", { name: "Request a new send attempt" });
    await expect(section).toContainText("Previous attempts remain counted");
    if (scenario.reason === undefined) {
      await expect(trigger).toBeEnabled();
      await trigger.click();
      await expect(page.getByRole("dialog").getByLabel("Reason")).toBeFocused();
    } else {
      await expect(trigger).toBeDisabled();
      await expect(section).toContainText(scenario.reason);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator("summary").filter({ hasText: "Delivery details" }).click();
      if (scenario.patch.payloadRetained === false) await expect(page.getByText("Original payload unavailable", { exact: true })).toBeVisible();
      if (scenario.patch.payloadExpiresAt !== undefined && scenario.patch.payloadExpiresAt !== "invalid") {
        await expect(page.locator("dd").filter({ hasText: /^Expired at / })).toBeVisible();
        await expect(page.getByText(/^Retained until /)).toHaveCount(0);
      }
    }
    expect(mock.posts).toHaveLength(0);
  });
}

test("retention expires while the reason is being entered, with Italian guidance at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const mock = await setup(page, { payloadExpiresAt: "2026-10-16T12:00:10Z" });
  await applyToken(page);
  await page.getByRole("button", { name: "Italian" }).click();
  await page.getByRole("button", { name: "Richiedi nuovo tentativo" }).click();
  const dialog = page.getByRole("dialog", { name: "Richiedi nuovo tentativo" });
  await dialog.getByLabel("Motivazione").fill("Verifica sintetica del ripristino");
  await page.clock.fastForward(10_000);
  await expect(dialog.getByRole("button", { name: "Conferma richiesta" })).toBeDisabled();
  await expect(dialog).toContainText("Il periodo di conservazione del payload originale è scaduto");
  await expect(dialog.getByLabel("Motivazione")).toHaveValue("Verifica sintetica del ripristino");
  await expect(dialog.getByLabel("Motivazione")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("main")).toBeFocused();
  await expect(page.getByRole("button", { name: "Richiedi nuovo tentativo" })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(mock.posts).toHaveLength(0);
});

for (const scenario of [
  { name: "state", type: "delivery-not-replayable", patch: { status: "RECEIVED" } as Partial<OperatorDeliveryDetail>, text: "Only exhausted deliveries" },
  { name: "connector", type: "connector-not-active", patch: { connectorStatus: "DISABLED" } as Partial<OperatorDeliveryDetail>, text: "connector must be active" },
  { name: "retention", type: "delivery-payload-expired", patch: { payloadExpiresAt: now.toISOString() }, text: "Gateway reports that the original payload is missing or its retention has expired" },
]) {
  test(`a concurrent ${scenario.name} rejection stays visible and refreshes eligibility`, async ({ page }) => {
    const mock = await setup(page);
    await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
      mock.posts.push(route.request());
      Object.assign(mock.delivery, scenario.patch);
      await route.fulfill({ status: 409, json: {
        type: `urn:problem:${scenario.type}`, title: "Delivery replay rejected", status: 409, detail: "Synthetic backend detail",
      } });
    });
    await applyToken(page);
    await submitNewRequest(page);
    const dialog = page.getByRole("dialog", { name: "Request a new send attempt" });
    await expect(dialog.getByRole("alert")).toContainText(scenario.text);
    await expect(dialog.getByRole("button", { name: "Confirm request" })).toBeDisabled();
    await expect.poll(() => mock.readCount()).toBeGreaterThan(1);
    await expect(dialog.getByLabel("Reason")).toHaveValue("Synthetic recovery check");
    expect(mock.posts).toHaveLength(1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Request a new send attempt" })).toBeDisabled();
    await expect(page.getByRole("main")).toBeFocused();
  });
}

test("a failed reread after rejection blocks new commands until the detail is refreshed", async ({ page }) => {
  const mock = await setup(page);
  let failReads = false;
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
    await route.fulfill(failReads
      ? { status: 503, json: { type: "urn:problem:gateway-unavailable", title: "Gateway unavailable", status: 503, detail: "Synthetic read failure" } }
      : { status: 200, json: mock.delivery });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    mock.posts.push(route.request());
    failReads = true;
    await route.fulfill({ status: 409, json: {
      type: "urn:problem:connector-not-active", title: "Delivery replay rejected", status: 409, detail: "Synthetic rejection",
    } });
  });
  await applyToken(page);
  await submitNewRequest(page);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("connector must be active");
  await expect(dialog).toContainText("Delivery eligibility could not be refreshed");
  await expect(dialog.getByRole("button", { name: "Confirm request" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Request a new send attempt" })).toBeDisabled();
  failReads = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("button", { name: "Request a new send attempt" })).toBeEnabled();
  expect(mock.posts).toHaveLength(1);
});

test("recovery of an already-sent command still works after payload expiry", async ({ page }) => {
  const mock = await setup(page, { payloadExpiresAt: "2026-10-16T12:00:10Z" });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    mock.posts.push(route.request());
    if (mock.posts.length === 1) { await route.abort("failed"); return; }
    mock.delivery.status = "RECEIVED";
    await route.fulfill({ status: 202, json: {
      commandId: "26998c94-b78f-4e33-8a24-47a8b353b9b8", idempotent: true, outcome: "REPLAYED",
    } });
  });
  await applyToken(page);
  await submitNewRequest(page);
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText("Outcome unconfirmed");
  await page.clock.fastForward(10_000);
  await expect(page.getByRole("button", { name: "Retry the same request" })).toBeEnabled();
  await page.getByRole("button", { name: "Retry the same request" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("was accepted");
  expect(mock.posts).toHaveLength(2);
  expect(mock.posts[1].headers()["idempotency-key"]).toBe(mock.posts[0].headers()["idempotency-key"]);
});

async function setup(page: Page, patch: Partial<OperatorDeliveryDetail> = {}) {
  await page.clock.install({ time: now });
  const delivery: OperatorDeliveryDetail = { ...deliveryDetail, status: "EXHAUSTED", provider: "ERP_B", connectorMode: "POLLING", connectorStatus: "ACTIVE", payloadExpiresAt: future, ...patch };
  const posts: Request[] = [];
  let reads = 0;
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
    reads++;
    await route.fulfill({ status: 200, json: delivery });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    posts.push(route.request());
    await route.fulfill({ status: 500, json: {} });
  });
  await page.goto(`/deliveries/${deliveryId}`);
  return { delivery, posts, readCount: () => reads };
}

async function applyToken(page: Page, role = "platform-admin") {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  await page.getByRole("button", { name: "Set operator access token" }).click();
  await page.getByLabel("Access token", { exact: true }).fill(
    `${encode({ alg: "RS256" })}.${encode({ sub: "synthetic-eligibility-operator", exp: 2_000_000_000, groups: [role] })}.signature`,
  );
  await page.getByRole("button", { name: "Use token" }).click();
}

async function submitNewRequest(page: Page) {
  await page.getByRole("button", { name: "Request a new send attempt" }).click();
  await page.getByLabel("Reason").fill("Synthetic recovery check");
  await page.getByRole("button", { name: "Confirm request" }).click();
}
