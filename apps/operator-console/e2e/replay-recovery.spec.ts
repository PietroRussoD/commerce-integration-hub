import { expect, test, type Page, type Request } from "@playwright/test";

import { deliveryDetail, deliveryId, deliveryPage } from "./fixtures";

// Synthetic credentials and intercepted API responses only. The command registry
// models a server accepting a command before its HTTP response is lost.
test("recovers a lost response after navigation and a delivery transition to RECEIVED", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  let accepted = false;
  const posts: Request[] = [];
  const commands = new Set<string>();
  await mockReads(page, () => accepted ? "RECEIVED" : "EXHAUSTED");
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    posts.push(route.request());
    commands.add(route.request().headers()["idempotency-key"]);
    accepted = true;
    if (posts.length === 1) { await route.abort("failed"); return; }
    await route.fulfill({ status: 202, json: acceptedResponse });
  });
  await openDelivery(page);
  await submitNewReplay(page);
  await expect(page.getByRole("alert")).toContainText("Outcome unconfirmed");
  await expect(page.getByLabel("Reason")).toHaveAttribute("readonly", "");
  await page.keyboard.press("Escape");
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  await navigation.getByRole("link", { name: "Simulator", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Simulator" })).toBeVisible();
  await navigation.getByRole("link", { name: "Deliveries", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deliveries", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "DELIVERY-E2E-001" }).click();
  await expect(page).toHaveURL(`/deliveries/${deliveryId}`);
  await expect(page.getByRole("heading", { name: "Delivery details" })).toBeVisible();
  await expect(page.getByText("Received", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resolve replay request" }).click();
  await expect(page.getByLabel("Reason")).toHaveValue("Synthetic recovery check");
  await expect(page.getByLabel("Reason")).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Retry the same request" }).click();
  await expect.poll(() => posts.length).toBe(2);
  await expect(page.getByRole("button", { name: "Resolve replay request" })).toHaveCount(0);
  expect(commands.size).toBe(1);
  expect(posts[1].postDataJSON()).toEqual(posts[0].postDataJSON());
  expect(posts[1].headers()["authorization"]).toBe(posts[0].headers()["authorization"]);
});

for (const firstFailure of ["503", "malformed-202"] as const) {
  test(`keeps one command through ${firstFailure}, dialog reopening and IN_PROGRESS`, async ({ page }) => {
    const posts: Request[] = [];
    await mockReads(page);
    await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
      posts.push(route.request());
      if (posts.length === 1) {
        await route.fulfill(firstFailure === "503"
          ? { status: 503, json: { type: "urn:problem:gateway-unavailable", title: "Gateway unavailable", status: 503, detail: "Synthetic unavailable response" } }
          : { status: 202, json: { outcome: "REPLAYED" } });
        return;
      }
      await route.fulfill({ status: 202, json: { ...acceptedResponse, outcome: posts.length === 2 ? "IN_PROGRESS" : "REPLAYED" } });
    });
    await openDelivery(page);
    await submitNewReplay(page);
    await expect(page.getByRole("alert")).toContainText("Outcome unconfirmed");
    expect(posts).toHaveLength(1);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Resolve replay request" }).click();
    await page.getByRole("button", { name: "Retry the same request" }).click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("already in progress");
    await page.getByRole("button", { name: "Retry the same request" }).click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("was accepted");
    expect(posts).toHaveLength(3);
    expect(new Set(posts.map((post) => post.headers()["idempotency-key"])).size).toBe(1);
    for (const post of posts) expect(post.postDataJSON()).toEqual({ reason: "Synthetic recovery check" });
  });
}

test("a new confirmation after a definitive rejection creates a separate command", async ({ page }) => {
  const posts: Request[] = [];
  await mockReads(page);
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    posts.push(route.request());
    await route.fulfill(posts.length === 1
      ? { status: 409, json: { type: "urn:problem:connector-not-active", title: "Delivery replay rejected", status: 409, detail: "Synthetic rejection" } }
      : { status: 202, json: acceptedResponse });
  });
  await openDelivery(page);
  await submitNewReplay(page);
  await expect(page.getByRole("alert")).toContainText("The Gateway rejected this request");
  await expect(page.getByLabel("Reason")).not.toHaveAttribute("readonly");
  // The operator confirms a separate intention with the same target and reason.
  await page.getByRole("button", { name: "Confirm replay" }).click();
  await expect(page.getByRole("dialog").getByRole("status")).toContainText("was accepted");
  expect(posts).toHaveLength(2);
  expect(posts[1].headers()["idempotency-key"]).not.toBe(posts[0].headers()["idempotency-key"]);
  expect(posts[1].postDataJSON()).toEqual(posts[0].postDataJSON());
});

const acceptedResponse = { commandId: "26998c94-b78f-4e33-8a24-47a8b353b9b8", idempotent: true, outcome: "REPLAYED" };

async function mockReads(page: Page, status: () => string = () => "EXHAUSTED") {
  await page.route("**/gateway-api/api/v1/operator/deliveries?**", async (route) => {
    await route.fulfill({ status: 200, json: { ...deliveryPage, items: deliveryPage.items.map((item) => ({ ...item, status: status() })) } });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
    await route.fulfill({ status: 200, json: { ...deliveryDetail, status: status() } });
  });
}

async function openDelivery(page: Page) {
  await page.goto(`/deliveries/${deliveryId}`);
  await page.getByRole("button", { name: "Set operator access token" }).click();
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  await page.getByLabel("Access token", { exact: true }).fill(
    `${encode({ alg: "RS256" })}.${encode({ sub: "synthetic-recovery-admin", exp: 2_000_000_000, groups: ["platform-admin"] })}.signature`,
  );
  await page.getByRole("button", { name: "Use token" }).click();
}

async function submitNewReplay(page: Page) {
  await page.getByRole("button", { name: "Replay delivery", exact: true }).click();
  await page.getByLabel("Reason").fill("Synthetic recovery check");
  await page.getByRole("button", { name: "Confirm replay" }).click();
}
