import { expect, test, type Page, type Request } from "@playwright/test";

import { orderDetail, orderId, orderPage, receiveOrderResponse } from "./fixtures";

test("opens an order from the operator list", async ({ page }) => {
  await mockOperatorApi(page);
  await page.goto("/orders");

  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await expect(page.getByRole("row", { name: /ORDER-E2E-001.*Ready/i })).toBeVisible();

  await page.getByRole("link", { name: "ORDER-E2E-001" }).click();

  await expect(page).toHaveURL(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
  await expect(page.getByRole("row", { name: /LINE-1 SKU-E2E-001 Browser-tested item/i })).toBeVisible();
});

test("submits an order and opens the accepted result", async ({ page }) => {
  await mockOperatorApi(page);
  let receivedRequest: Request | undefined;
  await page.route("**/api/v1/orders", async (route) => {
    receivedRequest = route.request();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(receiveOrderResponse) });
  });
  await page.goto("/simulator");

  await page.getByLabel("Source API key", { exact: true }).fill("e2e-key.secret");
  await page.getByRole("button", { name: "Submit order" }).click();

  await expect(page.getByRole("status")).toContainText("Order created");
  expect(receivedRequest?.headers()["x-source-api-key"]).toBe("e2e-key.secret");
  expect(receivedRequest?.postDataJSON()).toMatchObject({
    currency: "EUR",
    declaredTotalAmount: "39.98",
    items: [{ sku: "DEMO-SKU-001", quantity: "2", unitPrice: "19.99" }],
  });

  await page.getByRole("link", { name: "View order" }).click();
  await expect(page).toHaveURL(`/orders/${orderId}`);
  await expect(page.getByText("ORDER-E2E-001")).toBeVisible();
});

test("associates API validation errors and focuses the first invalid field", async ({ page }) => {
  await page.route("**/api/v1/orders", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/problem+json",
      body: JSON.stringify({
        type: "urn:problem:request-validation",
        title: "Request validation failed",
        status: 400,
        detail: "One or more request fields are invalid.",
        instance: "/api/v1/orders",
        code: "REQUEST_VALIDATION_FAILED",
        errors: [
          { field: "currency", message: "must match EUR, GBP, or USD" },
          { field: "externalId", message: "must not be blank" },
        ],
      }),
    });
  });
  await page.goto("/simulator");

  await page.getByLabel("Source API key", { exact: true }).fill("e2e-key.secret");
  await page.getByRole("button", { name: "Submit order" }).click();

  await expect(page.getByRole("alert")).toContainText("One or more request fields are invalid.");
  const externalId = page.getByLabel("External order ID");
  await expect(externalId).toBeFocused();
  await expect(externalId).toHaveAttribute("aria-invalid", "true");
  await expect(externalId).toHaveAttribute("aria-describedby", "order-external-id-error");
  await expect(page.locator("#order-external-id-error")).toHaveText("must not be blank");
});

test("supports keyboard skip navigation without mobile page overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await mockOperatorApi(page);
  await page.goto("/orders");
  await expect(page.getByText("ORDER-E2E-001")).toBeVisible();

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test("replays a recorded rejection through the Flow Explorer", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/flow-explorer");

  await expect(page.getByRole("heading", { name: "Flow Explorer" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Successful delivery" })).toBeChecked();

  await page.getByText("Poison item", { exact: true }).click();
  await expect(page.getByRole("radio", { name: "Poison item" })).toBeChecked();

  const rejectedStep = page.getByRole("button", {
    name: "Step 3, ERP_ITEM_REJECTED, Rejected",
  });
  await rejectedStep.click();
  await expect(page.getByRole("heading", { name: "ERP_ITEM_REJECTED" })).toBeVisible();
  await expect(page.getByText("ERP_B_UNSUPPORTED_CURRENCY")).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Gateway PostgreSQL, Destination" })).toBeVisible();

  await rejectedStep.focus();
  await page.keyboard.press("End");
  const terminalStep = page.getByRole("button", {
    name: "Step 5, SCENARIO_COMPLETED_WITH_REJECTIONS, Rejected",
  });
  await expect(terminalStep).toBeFocused();
  await expect(page.getByRole("heading", { name: "SCENARIO_COMPLETED_WITH_REJECTIONS" })).toBeVisible();

  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function mockOperatorApi(page: Page) {
  await page.route("**/api/v1/operator/orders?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(orderPage) });
  });
  await page.route("**/api/v1/operator/orders/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(orderDetail) });
  });
}
