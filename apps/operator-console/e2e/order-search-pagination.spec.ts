import { expect, test } from "@playwright/test";

import { orderPage, projectedOrderPage, searchProjectionStatus } from "./fixtures";

// Synthetic Core responses hold page two until the operator changes the active filter.
test("a slow complete-list page cannot be skipped and a changed filter drops old rows", async ({ page }) => {
  const requestedPages: { offset: number; status: string | null }[] = [];
  let releaseSlowPage!: () => void;
  const slowPage = new Promise<void>((resolve) => { releaseSlowPage = resolve; });
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const offset = Number(url.searchParams.get("offset") ?? 0);
    if (url.pathname.endsWith("/search/status")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(searchProjectionStatus) });
      return;
    }
    requestedPages.push({ offset, status });
    if (status === "RECEIVED") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ...orderPage, items: [{ ...orderPage.items[0], id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f90", externalOrderId: "ORDER-RECEIVED-001", status: "RECEIVED" }],
      }) });
      return;
    }
    if (offset === 25) {
      await slowPage;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ...orderPage, offset: 25, total: 51, items: [{ ...orderPage.items[0], externalOrderId: "ORDER-PAGE-26" }],
      }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...orderPage, total: 51 }) });
  });

  await page.goto("/orders");
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
  const nextPage = page.getByRole("button", { name: "Next page" });
  await nextPage.dblclick({ delay: 20 });
  await expect(page).toHaveURL("/orders?offset=25");
  await expect(page.getByRole("status", { name: "Loading orders" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
  expect(requestedPages.filter(({ offset }) => offset === 25)).toHaveLength(1);
  expect(requestedPages.some(({ offset }) => offset === 50)).toBe(false);

  await page.getByLabel("Status").selectOption("RECEIVED");
  await expect(page).toHaveURL("/orders?status=RECEIVED");
  await expect(page.getByRole("link", { name: "ORDER-RECEIVED-001" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toHaveCount(0);
  releaseSlowPage();
  await expect(page.getByRole("link", { name: "ORDER-RECEIVED-001" })).toBeVisible();
  expect(requestedPages.some(({ offset, status }) => offset === 50 || offset === 25 && status === "RECEIVED")).toBe(false);
  await expect(page.getByRole("status")).toContainText("1-1 of 1");
});

test("a slow indexed-search page hides old rows, marks results busy and disables paging", async ({ page }) => {
  let releaseSlowSearch!: () => void;
  const slowSearch = new Promise<void>((resolve) => { releaseSlowSearch = resolve; });
  const requestedOffsets: number[] = [];
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/search/status")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(searchProjectionStatus) });
      return;
    }
    if (!url.pathname.endsWith("/search")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...orderPage, total: 0, items: [] }) });
      return;
    }
    const offset = Number(url.searchParams.get("offset") ?? 0);
    requestedOffsets.push(offset);
    if (offset === 25) await slowSearch;
    const result = offset === 25
      ? { ...projectedOrderPage, offset: 25, total: 51, items: [{ ...projectedOrderPage.items[0], externalOrderId: "ORDER-SEARCH-26" }] }
      : { ...projectedOrderPage, total: 51 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(result) });
  });

  await page.goto("/orders");
  const searchbox = page.getByRole("searchbox", { name: "Search projected orders" });
  await expect(searchbox).toBeEnabled();
  await searchbox.fill("blue");
  await page.getByRole("button", { name: "Search projected orders" }).click();
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toBeVisible();
  const nextPage = page.getByRole("button", { name: "Next page" });
  await nextPage.dblclick({ delay: 20 });
  await expect(page).toHaveURL("/orders?q=blue&searchOffset=25");
  await expect(page.getByRole("status", { name: "Searching projected orders" })).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next page" })).toHaveCount(0);
  expect(requestedOffsets.filter((offset) => offset === 25)).toHaveLength(1);
  expect(requestedOffsets).not.toContain(50);

  releaseSlowSearch();
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-26" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("26-26 of 51");
});
