import { expect, test } from "@playwright/test";

import { orderPage, searchProjectionStatus } from "./fixtures";

// Synthetic Core responses keep this layout check independent of OpenSearch availability.
for (const width of [390, 768, 1440]) {
  test(`keeps search diagnostics compact and expandable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route("**/api/v1/operator/orders**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      const body = path.endsWith("/search/status") ? searchProjectionStatus : orderPage;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });

    await page.goto("/orders");
    await expect(page.getByText("Indexed order search")).toBeVisible();
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
    const result = await page.getByRole("link", { name: "ORDER-E2E-001" }).boundingBox();
    expect(result?.y).toBeLessThan(650);

    const diagnostics = page.locator("details");
    await expect(diagnostics).not.toHaveAttribute("open", "");
    await expect(page.getByText("orders-read")).not.toBeVisible();
    await diagnostics.locator("summary").focus();
    await diagnostics.locator("summary").press("Enter");
    await expect(page.getByRole("heading", { name: "Search projection" })).toBeVisible();
    await expect(page.getByText("orders-read")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Projection progress" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Reindex" })).toBeVisible();
  });
}

test("keeps projection status concise while the complete order list remains available", async ({ page }) => {
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const body = path.endsWith("/search/status")
      ? { ...searchProjectionStatus, availability: "UNAVAILABLE" }
      : orderPage;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/orders");

  await expect(page.getByText("Indexed order search")).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search projected orders" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Projection progress" })).toHaveCount(0);
});
