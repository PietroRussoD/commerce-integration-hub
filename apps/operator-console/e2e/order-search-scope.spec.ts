import { expect, test } from "@playwright/test";

import { orderPage, projectedOrderPage, searchProjectionStatus } from "./fixtures";

// Synthetic API responses exercise console behavior; no live Core or index is used.
test("keeps one active scope across filtering, editing, refresh and browser history", async ({ page }) => {
  const requests: URL[] = [];
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    const status = url.searchParams.get("status");
    const body = url.pathname.endsWith("/search/status") ? searchProjectionStatus
      : url.pathname.endsWith("/search") ? {
        ...projectedOrderPage,
        items: status === "RECEIVED" ? [] : projectedOrderPage.items,
        offset: Number(url.searchParams.get("offset")),
        total: status === "RECEIVED" ? 0 : 1,
      } : { ...orderPage, items: orderPage.items.map((order) => ({ ...order, status: status ?? order.status })), total: 100 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/orders?status=RECEIVED");
  await expect(page.getByText("Complete order list · Total: 100")).toBeVisible();
  const searchbox = page.getByRole("searchbox", { name: "Search projected orders" });
  await searchbox.fill("browser");
  await page.getByRole("button", { name: "Search projected orders" }).click();
  await expect(page.getByText("Indexed search · Total: 0")).toBeVisible();
  await expect(page.getByText("No projected orders found", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toHaveCount(0);
  expect(requests.filter((url) => url.pathname.endsWith("/search")).slice(-1)[0]?.searchParams.get("status")).toBe("RECEIVED");

  await page.getByLabel("Status").selectOption("READY");
  await expect(page).toHaveURL("/orders?status=READY&q=browser");
  await expect(page.getByText("Indexed search · Total: 1")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toBeVisible();
  await searchbox.fill("unsubmitted draft");
  await expect(page.getByText("Applied criteria: Description: browser")).toBeVisible();
  await expect(page.getByText(/The fields have changed/)).toBeVisible();

  const searchReads = requests.filter((url) => url.pathname.endsWith("/search")).length;
  const listReads = requests.filter((url) => url.pathname.endsWith("/orders")).length;
  await page.getByRole("button", { name: "Refresh orders" }).click();
  await expect.poll(() => requests.filter((url) => url.pathname.endsWith("/search")).length).toBe(searchReads + 1);
  await expect(page.getByRole("button", { name: "Refresh orders" })).toBeEnabled();
  expect(requests.filter((url) => url.pathname.endsWith("/orders"))).toHaveLength(listReads);
  const refreshedSearch = requests.filter((url) => url.pathname.endsWith("/search")).slice(-1)[0]!;
  expect(refreshedSearch.searchParams.get("q")).toBe("browser");
  expect(refreshedSearch.searchParams.get("status")).toBe("READY");

  await page.reload();
  await expect(searchbox).toHaveValue("browser");
  await expect(page.getByRole("table")).toHaveCount(1);
  await page.getByRole("button", { name: "Complete order list" }).click();
  await expect(page).toHaveURL("/orders?status=READY");
  await expect(page.getByText("Complete order list · Total: 100")).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL("/orders?status=READY&q=browser");
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
});

test("keeps the complete list usable and search recovery explicit during an index outage", async ({ page }) => {
  let available = true;
  let searchReads = 0;
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/search")) searchReads++;
    const body = path.endsWith("/search/status")
      ? { ...searchProjectionStatus, availability: available ? "AVAILABLE" : "UNAVAILABLE" }
      : path.endsWith("/search") ? projectedOrderPage : orderPage;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/orders?q=browser");
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toBeVisible();
  available = false;
  await page.getByRole("button", { name: "Refresh orders" }).click();
  await expect(page.getByText("Projected order search is unavailable")).toBeVisible();
  await expect(page.getByRole("table")).toHaveCount(0);
  await expect(page.getByText("Indexed search", { exact: true })).toBeVisible();

  const previousSearchReads = searchReads;
  await page.getByRole("button", { name: "Refresh orders" }).click();
  await expect(page.getByRole("button", { name: "Refresh orders" })).toBeEnabled();
  expect(searchReads).toBe(previousSearchReads);
  available = true;
  await page.getByRole("button", { name: "Refresh orders" }).click();
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toBeVisible();
  await expect.poll(() => searchReads).toBe(previousSearchReads + 1);

  available = false;
  await page.reload();
  await expect(page.getByText("Projected order search is unavailable")).toBeVisible();
  await page.getByRole("button", { name: "Complete order list" }).click();
  await expect(page.getByText("Complete order list · Total: 1")).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Search projected orders" })).toBeDisabled();
});
