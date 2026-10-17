import { expect, test, type Page } from "@playwright/test";

import { deliveryDetail, deliveryId, deliveryPage } from "./fixtures";

// Synthetic credentials and API responses. Cursors use the implemented codec's
// envelope, but these browser tests do not contact a live authenticated Gateway.
const cursors = ["12:00:00", "11:00:00", "10:00:00"].map((time) =>
  Buffer.from(JSON.stringify({ i: deliveryId, r: `2026-09-12T${time}.000000Z`, v: 1 })).toString("base64url"),
);
const filters = "provider=ERP_B&status=EXHAUSTED";

for (const width of [320, 390, 1440]) {
  test(`delivery navigation preserves filters and visited cursors at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockGateway(page);
    await page.goto("/deliveries");
    await applyToken(page);
    if (width < 1024) {
      const deliveryCards = page.getByRole("list", { name: "Deliveries" });
      await expect(deliveryCards).toContainText("CORE_UNAVAILABLE");
      await expect(deliveryCards.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
      await expect(page.getByRole("table")).toBeHidden();
    } else {
      await expect(page.getByRole("table")).toBeVisible();
      await expect(page.getByRole("list", { name: "Deliveries" })).toBeHidden();
    }
    await expect(page.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
    await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("ERP_B");
    await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("EXHAUSTED");
    await expect(page).toHaveURL(`/deliveries?${filters}`);
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    await expect(page.getByRole("link", { name: "DELIVERY-PAGE-2" })).toBeVisible();
    await page.getByRole("button", { name: "Next page", exact: true }).click();
    const listUrl = `/deliveries?${filters}&cursor=${cursors[1]}`;
    await expect(page).toHaveURL(listUrl);
    await page.getByRole("link", { name: "DELIVERY-PAGE-3" }).click();
    const detailUrl = `/deliveries/${deliveryId}?${filters}&cursor=${cursors[1]}`;
    await expect(page).toHaveURL(detailUrl);
    const returnLink = page.locator('section[aria-labelledby="delivery-detail-heading"]').getByRole("link", { name: "Deliveries", exact: true });
    await expect(returnLink).toHaveAttribute("href", listUrl);
    await returnLink.click();
    await expect(page.getByRole("link", { name: "DELIVERY-PAGE-3" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Provider", exact: true })).toHaveValue("ERP_B");
    await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("EXHAUSTED");

    await page.goBack();
    await expect(page).toHaveURL(detailUrl);
    await page.goBack();
    await expect(page).toHaveURL(listUrl);
    await page.goBack();
    await expect(page.getByRole("link", { name: "DELIVERY-PAGE-2" })).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(listUrl);
    await page.reload();
    await expect(page.getByRole("alert")).toContainText("An operator access token is required");
    await applyToken(page);
    await expect(page.getByRole("link", { name: "DELIVERY-PAGE-3" })).toBeVisible();
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(page.getByRole("link", { name: "DELIVERY-PAGE-2" })).toBeVisible();
    await page.getByRole("button", { name: "Previous page", exact: true }).click();
    await expect(page).toHaveURL(`/deliveries?${filters}`);
    await expect(page.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("a copied delivery URL restores the current cursor without inventing a previous page", async ({ page }) => {
  const requests = await mockGateway(page);
  await page.goto(`/deliveries?${filters}&cursor=${cursors[1]}`);
  await applyToken(page);
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-3" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Refresh deliveries" }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests.every((url) => url.searchParams.get("cursor") === cursors[1]
    && url.searchParams.get("provider") === "ERP_B" && url.searchParams.get("status") === "EXHAUSTED")).toBe(true);
  await page.getByRole("button", { name: "First page", exact: true }).click();
  await expect(page).toHaveURL(`/deliveries?${filters}`);
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
});

test("changing a delivery filter drops the current cursor and its previous-page history", async ({ page }) => {
  await mockGateway(page);
  await page.goto(`/deliveries?${filters}`);
  await applyToken(page);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-2" })).toBeVisible();
  await page.getByRole("combobox", { name: "Status", exact: true }).selectOption("DELIVERED");
  await expect(page).toHaveURL("/deliveries?provider=ERP_B&status=DELIVERED");
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous page", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "First page", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-2" })).toBeVisible();
  await page.getByRole("combobox", { name: "Provider", exact: true }).selectOption("ALL");
  await expect(page).toHaveURL("/deliveries?status=DELIVERED");
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
});

test("a rejected cursor offers first-page recovery without automatically retrying the rejected read", async ({ page }) => {
  const requests = await mockGateway(page);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/deliveries?${filters}&cursor=not-an-opaque-cursor`);
  await applyToken(page);
  await page.getByRole("button", { name: "Italian", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Il Gateway ha rifiutato la richiesta di questa pagina");
  await expect(page.getByRole("button", { name: "Riprova", exact: true })).toHaveCount(0);
  await page.waitForTimeout(1500); // The default query retry delay would have elapsed.
  expect(requests).toHaveLength(1);
  await page.getByRole("button", { name: "Prima pagina", exact: true }).click();
  await expect(page).toHaveURL(`/deliveries?${filters}`);
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Stato", exact: true })).toHaveValue("EXHAUSTED");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("an empty cursor page still offers first-page recovery", async ({ page }) => {
  await mockGateway(page);
  await page.goto(`/deliveries?${filters}&cursor=${cursors[2]}`);
  await applyToken(page);
  await expect(page.getByText("No deliveries on this page. Use First page below or change the filters.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "First page", exact: true }).click();
  await expect(page).toHaveURL(`/deliveries?${filters}`);
  await expect(page.getByRole("link", { name: "DELIVERY-PAGE-1" })).toBeVisible();
});

async function mockGateway(page: Page) {
  const requests: URL[] = [];
  await page.route("**/gateway-api/api/v1/operator/deliveries?**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const cursor = url.searchParams.get("cursor");
    const index = cursor === null ? 0 : cursors.indexOf(cursor) + 1;
    if (cursor !== null && index === 0) {
      await route.fulfill({ status: 400, contentType: "application/problem+json", json: {
        type: "urn:problem:operator-request-validation", title: "Operator request validation failed", status: 400,
        detail: "The operator request parameters are invalid",
      } });
      return;
    }
    await route.fulfill({ status: 200, json: {
      items: index === 3 ? [] : deliveryPage.items.map((item) => ({
        ...item, externalEventId: `DELIVERY-PAGE-${index + 1}`, status: url.searchParams.get("status") ?? item.status,
      })),
      nextCursor: index < 2 ? cursors[index] : null,
    } });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
    await route.fulfill({ status: 200, json: deliveryDetail });
  });
  return requests;
}

async function applyToken(page: Page) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  await page.getByRole("button", { name: "Set operator access token" }).click();
  await page.getByRole("textbox", { name: "Access token", exact: true }).fill(
    `${encode({ alg: "RS256" })}.${encode({ sub: "synthetic-navigation-operator", exp: 2_000_000_000, groups: ["operator"] })}.signature`,
  );
  await page.getByRole("button", { name: "Use token" }).click();
}
