import { expect, test } from "@playwright/test";

import { orderDetail, orderId } from "./fixtures";

test("order details can be refreshed explicitly and report the latest successful read", async ({ page }) => {
  let reads = 0;
  let holdRefresh = false;
  let releaseRefresh!: () => void;
  const refreshPending = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  await page.route("**/api/v1/operator/orders/**", async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith(`/${orderId}`)) return route.continue();
    reads += 1;
    if (!holdRefresh) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...orderDetail, status: "RECEIVED" }) });
      return;
    }
    await refreshPending;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...orderDetail, status: "READY" }) });
  });

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Updated /)).toBeVisible();
  holdRefresh = true;
  await page.getByRole("button", { name: "Refresh order" }).click();
  await expect.poll(() => reads).toBeGreaterThanOrEqual(2);
  await expect(page.getByRole("button", { name: "Refreshing order details…" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("Refreshing order details…");
  await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
  releaseRefresh();
  await expect(page.getByText("Ready", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Refresh order" })).toBeEnabled();
  expect(reads).toBeGreaterThanOrEqual(2);
});

test("a failed detail refresh keeps the last successful data and explains its age", async ({ page }) => {
  let reads = 0;
  let failReads = false;
  await page.route("**/api/v1/operator/orders/**", async (route) => {
    if (!new URL(route.request().url()).pathname.endsWith(`/${orderId}`)) return route.continue();
    reads += 1;
    if (!failReads) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...orderDetail, status: "RECEIVED" }) });
      return;
    }
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ status: 503, detail: "Synthetic unavailable response" }) });
  });

  await page.goto(`/orders/${orderId}`);
  await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
  failReads = true;
  await page.getByRole("button", { name: "Refresh order" }).click();
  await expect(page.getByRole("alert")).toContainText("The details below are from the last successful read.");
  await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/^Updated /)).toBeVisible();
  expect(reads).toBeGreaterThanOrEqual(2);
});
