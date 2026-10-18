import { expect, test, type Page, type Request } from "@playwright/test";

import {
  deliveryDetail,
  deliveryId,
  deliveryPage,
  orderDetail,
  orderId,
  orderPage,
  projectedOrderPage,
  receiveOrderResponse,
  searchProjectionStatus,
} from "./fixtures";

for (const width of [320, 390, 768, 1440]) {
  test(`keeps navigation readable, role-aware, and keyboard-accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/simulator");

    const navigation = page.getByRole("navigation", { name: "Primary navigation" });
    const links = navigation.getByRole("link");
    await expect(links).toHaveCount(4);
    await expect(navigation.getByRole("link", { name: "Simulator" })).toHaveAttribute("aria-current", "page");
    await expect(navigation.getByRole("link", { name: "Deliveries" })).toHaveCount(0);

    for (const link of await links.all()) {
      await expect(link).toBeVisible();
      const box = await link.boundingBox();
      expect(box?.height).toBeGreaterThanOrEqual(40);
      expect(await link.locator("span").evaluate((label) => label.scrollWidth <= label.clientWidth)).toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(await navigation.evaluate((element) => getComputedStyle(element).position)).toBe(width >= 1024 ? "sticky" : "relative");

    await applyToken(page, createOperatorToken(["operator"], `navigation-${width}`));
    await expect(navigation.getByRole("link", { name: "Deliveries" })).toBeVisible();

    const systemMapLink = navigation.getByRole("link", { name: "System Map" });
    await systemMapLink.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL("/system-map");
    await expect(systemMapLink).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("main")).toBeFocused();
  });
}

for (const width of [390, 768, 1440]) {
  test(`keeps selected system-map details in view at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/system-map");

    const target = page.getByRole("button", { name: "Prometheus and Grafana" });
    await target.focus();
    await page.keyboard.press("Enter");
    await expect(target).toHaveAttribute("aria-pressed", "true");

    if (width < 1280) {
      const inlineDetails = page.getByTestId("system-map-inline-details");
      await expect(inlineDetails).toBeVisible();
      await inlineDetails.scrollIntoViewIfNeeded();
      const targetBox = await target.boundingBox();
      const detailsBox = await inlineDetails.boundingBox();
      expect(detailsBox?.y).toBeGreaterThanOrEqual((targetBox?.y ?? 0) + (targetBox?.height ?? 0));
      await expect(inlineDetails.getByRole("heading", { name: "Prometheus and Grafana" })).toBeVisible();
    } else {
      const desktopDetails = page.getByTestId("system-map-desktop-details");
      await expect(desktopDetails).toBeVisible();
      const detailsBox = await desktopDetails.boundingBox();
      expect(detailsBox?.y).toBeGreaterThanOrEqual(60);
      expect(detailsBox?.y).toBeLessThan(844);
      await expect(desktopDetails.getByRole("heading", { name: "Prometheus and Grafana" })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Open technical reference" }).last()).toHaveAttribute(
      "href",
      "https://github.com/PietroRussoD/commerce-integration-hub/blob/main/services/integration-core/README.md#observability",
    );
  });
}

test("opens an order from the operator list", async ({ page }) => {
  await mockOperatorApi(page);
  await page.goto("/orders");

  await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
  await page.getByText("Show technical details").click();
  await expect(page.getByText("250 ms")).toBeVisible();
  await expect(page.getByRole("row", { name: /ORDER-E2E-001.*Ready/i })).toBeVisible();

  await page.getByRole("link", { name: "ORDER-E2E-001" }).click();

  await expect(page).toHaveURL(`/orders/${orderId}`);
  await expect(page.getByRole("heading", { name: "ORDER-E2E-001" })).toBeVisible();
  await expect(page.getByRole("row", { name: /LINE-1 SKU-E2E-001 Browser-tested item/i })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`keeps complete and indexed order results readable on a ${width}px smartphone`, async ({ page }) => {
    await mockOperatorApi(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/orders");

    const completeOrders = page.getByRole("list", { name: "Orders" });
    await expect(completeOrders.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
    await expect(completeOrders).toContainText("Marketplace A");
    await expect(completeOrders).toContainText("Ready");
    await expect(completeOrders).toContainText("€39.98");
    await expect(page.getByRole("table")).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    await submitSearch(page);
    const indexedOrders = page.getByRole("list", { name: "Search projected orders" });
    await expect(indexedOrders.getByRole("link", { name: "ORDER-SEARCH-001" })).toBeVisible();
    await expect(indexedOrders).toContainText("Browser-tested item");
    await expect(indexedOrders).toContainText("Ready");
    await expect(indexedOrders).toContainText("€39.98");
    await expect(page.getByRole("table")).toBeHidden();

    await indexedOrders.getByRole("link", { name: "ORDER-SEARCH-001" }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(`/orders/${orderId}?q=browser`);
    await page.getByRole("main").getByRole("link", { name: "Orders", exact: true }).click();
    await expect(page).toHaveURL("/orders?q=browser");
    await expect(page.getByRole("list", { name: "Search projected orders" })).toContainText("ORDER-SEARCH-001");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("shows precise timeline timestamps and copies their original ISO value", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.route("**/api/v1/operator/orders/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...orderDetail,
        timeline: [{
          ...orderDetail.timeline[0],
          occurredAt: "2026-08-21T08:00:00.006Z",
        }],
      }),
    });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/orders/${orderId}`);

  const timestamp = page.locator('time[datetime="2026-08-21T08:00:00.006Z"]');
  await expect(timestamp).toContainText("00.006");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const timestampDetails = page.locator("details").filter({ has: page.getByText("Exact timestamp (ISO 8601)") });
  await timestampDetails.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("2026-08-21T08:00:00.006Z")).toBeVisible();
  await page.getByRole("button", { name: "Copy ISO timestamp" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Exact timestamp copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("2026-08-21T08:00:00.006Z");
});

for (const theme of [
  { id: "integration-hub", host: "127.0.0.1" },
  { id: "client-blue", host: "client-blue.localhost" },
]) {
  test(`keeps order identifiers and correlation IDs readable in ${theme.id}`, async ({ page }) => {
    await mockOperatorApi(page);
    const origin = `http://${theme.host}:4173`;
    await page.goto(`${origin}/orders`);
    await expect(page.locator("html")).toHaveAttribute("data-brand", theme.id);
    await expectReadableContrast(page, ".font-mono.text-xs.text-app-foreground-muted");

    await page.goto(`${origin}/orders/${orderId}`);
    await expect(page.getByRole("heading", { name: "ORDER-E2E-001" })).toBeVisible();
    await page.getByText("Technical details").click();
    await expectReadableContrast(page, "details dd.font-mono.text-xs.text-app-foreground-secondary");
  });
}

test("searches projected orders after the projection becomes available", async ({ page }) => {
  let searchRequest: Request | undefined;
  await mockOperatorApi(page, (request) => {
    searchRequest = request;
  });
  await page.goto("/orders");

  const search = page.getByRole("searchbox", { name: "Search projected orders" });
  await expect(search).toBeEnabled();
  await search.fill("browser");
  await page.getByRole("button", { name: "Search projected orders" }).click();

  await expect(page.getByRole("row", { name: /ORDER-SEARCH-001.*Ready/i })).toBeVisible();
  expect(new URL(searchRequest?.url() ?? "").searchParams.get("q")).toBe("browser");
});

test("keeps a maximum-length external order ID readable on a narrow screen", async ({ page }) => {
  const externalOrderId = "ORDER-" + "X".repeat(122);
  await page.route("**/api/v1/operator/orders/*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...orderDetail, externalOrderId }),
    });
  });
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/orders/${orderId}`);

  const heading = page.getByRole("heading", { name: externalOrderId });
  await expect(heading).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  const technicalDetails = page.locator("details").filter({ has: page.getByText("Technical details") });
  await expect(technicalDetails).not.toHaveAttribute("open");
  await expect(technicalDetails.getByText(orderId)).not.toBeVisible();
  await technicalDetails.locator("summary").click();
  await expect(technicalDetails.getByText(orderId)).toBeVisible();
});

test("restores order filters, search and pagination from the URL when returning from a detail", async ({ page }) => {
  const requestedUrls: URL[] = [];
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const url = new URL(route.request().url());
    requestedUrls.push(url);
    const path = url.pathname;
    const body = path.endsWith("/search/status") ? searchProjectionStatus
      : path.endsWith("/search") ? { ...projectedOrderPage, offset: Number(url.searchParams.get("offset")), total: 26 }
      : path.endsWith(`/${orderId}`) ? orderDetail
      : { ...orderPage, offset: Number(url.searchParams.get("offset")), total: 26 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  const listUrl = `/orders?status=READY&offset=25&q=browser&externalOrderId=ORDER-E2E-001&sku=SKU-E2E-001&searchOffset=25`;
  await page.goto(listUrl);
  await expect(page.getByLabel("Status")).toHaveValue("READY");
  await expect(page.getByRole("searchbox", { name: "Search projected orders" })).toHaveValue("browser");
  await expect(page.getByRole("textbox", { name: "External order ID" })).toHaveValue("ORDER-E2E-001");
  await expect(page.getByRole("textbox", { name: "SKU" })).toHaveValue("SKU-E2E-001");
  await expect(page.getByText("26-26 of 26").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toHaveAttribute("href", `/orders/${orderId}?status=READY&offset=25&q=browser&externalOrderId=ORDER-E2E-001&sku=SKU-E2E-001&searchOffset=25`);

  await page.getByRole("link", { name: "ORDER-SEARCH-001" }).click();
  await expect(page).toHaveURL(`/orders/${orderId}?status=READY&offset=25&q=browser&externalOrderId=ORDER-E2E-001&sku=SKU-E2E-001&searchOffset=25`);
  const returnLink = page.locator('section[aria-labelledby="order-detail-heading"]').getByRole("link", { name: "Orders" });
  await expect(returnLink).toHaveAttribute("href", listUrl);
  await returnLink.click();
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByLabel("Status")).toHaveValue("READY");
  await expect(page.getByRole("searchbox", { name: "Search projected orders" })).toHaveValue("browser");
  await expect(page.getByText("26-26 of 26").first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(`/orders/${orderId}?status=READY&offset=25&q=browser&externalOrderId=ORDER-E2E-001&sku=SKU-E2E-001&searchOffset=25`);
  await expect(page.getByRole("heading", { name: "ORDER-E2E-001" })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(listUrl);
  await expect(page.getByRole("searchbox", { name: "Search projected orders" })).toHaveValue("browser");

  await page.reload();
  await expect(page.getByRole("link", { name: "ORDER-SEARCH-001" })).toBeVisible();
  expect(requestedUrls.some((url) => url.pathname.endsWith("/search")
    && url.searchParams.get("q") === "browser"
    && url.searchParams.get("externalOrderId") === "ORDER-E2E-001"
    && url.searchParams.get("sku") === "SKU-E2E-001"
    && url.searchParams.get("offset") === "25")).toBe(true);
});

test("writes order filters, list paging and search criteria to the URL", async ({ page }) => {
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith("/search/status") ? searchProjectionStatus
      : url.pathname.endsWith("/search") ? { ...projectedOrderPage, offset: Number(url.searchParams.get("offset")), total: 26 }
      : { ...orderPage, offset: Number(url.searchParams.get("offset")), total: 26 };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });

  await page.goto("/orders");
  await expect(page.getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();
  await page.getByLabel("Status").selectOption("READY");
  await expect(page).toHaveURL("/orders?status=READY");
  await page.getByRole("button", { name: "Next page" }).first().click();
  await expect(page).toHaveURL("/orders?status=READY&offset=25");

  await page.getByRole("button", { name: "Toggle search filters" }).click();
  await page.getByRole("searchbox", { name: "Search projected orders" }).fill("browser");
  await page.getByRole("textbox", { name: "External order ID" }).fill("ORDER-E2E-001");
  await page.getByRole("textbox", { name: "SKU" }).fill("SKU-E2E-001");
  await page.getByRole("button", { name: "Search projected orders" }).click();
  await expect(page).toHaveURL("/orders?status=READY&q=browser&externalOrderId=ORDER-E2E-001&sku=SKU-E2E-001");

  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL("/orders?status=READY&q=browser&externalOrderId=ORDER-E2E-001&sku=SKU-E2E-001&searchOffset=25");
});

test("isolates all Core reads when applying, renewing and removing a token", async ({ page }) => {
  // Synthetic claims and signatures test the console, not backend JWT validation.
  const firstToken = createOperatorToken(["operator"], "first");
  const renewedToken = createOperatorToken(["operator"], "renewed");
  const requests: { path: string; authorization: string | undefined }[] = [];
  let anonymousLabel = "ANONYMOUS-INITIAL";
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
  let releaseRenewed!: () => void;
  const renewedGate = new Promise<void>((resolve) => { releaseRenewed = resolve; });
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const authorization = route.request().headers()["authorization"];
    requests.push({ path, authorization });
    const label = authorization === `Bearer ${firstToken}` ? "TOKEN-FIRST"
      : authorization === `Bearer ${renewedToken}` ? "TOKEN-RENEWED" : anonymousLabel;
    if (authorization === `Bearer ${firstToken}`) await firstGate;
    if (authorization === `Bearer ${renewedToken}`) await renewedGate;
    const body = path.endsWith("/search/status") ? searchProjectionStatus
      : path.endsWith("/search") ? { ...projectedOrderPage, items: projectedOrderPage.items.map((order) => ({ ...order, externalOrderId: `${label}-SEARCH` })) }
      : path.endsWith(`/${orderId}`) ? { ...orderDetail, externalOrderId: label }
      : { ...orderPage, items: orderPage.items.map((order) => ({ ...order, externalOrderId: label })) };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.goto("/orders");
  await expect(page.getByRole("link", { name: "ANONYMOUS-INITIAL", exact: true })).toBeVisible();
  await submitSearch(page);
  await expect(page.getByRole("link", { name: "ANONYMOUS-INITIAL-SEARCH", exact: true })).toBeVisible();

  await applyToken(page, firstToken);
  await expect(page.getByRole("link", { name: /^ANONYMOUS-INITIAL/ })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Searching projected orders" })).toBeVisible();
  releaseFirst();
  await expect(page.getByRole("link", { name: "TOKEN-FIRST-SEARCH", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear projected order search" }).click();
  await expect(page.getByRole("link", { name: "TOKEN-FIRST", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "TOKEN-FIRST", exact: true }).click();
  await expect(page.getByRole("heading", { name: "TOKEN-FIRST", exact: true })).toBeVisible();

  await applyToken(page, renewedToken);
  await expect(page.getByRole("heading", { name: "TOKEN-FIRST", exact: true })).toHaveCount(0);
  await expect(page.getByRole("status", { name: "Loading order details" })).toBeVisible();
  releaseRenewed();
  await expect(page.getByRole("heading", { name: "TOKEN-RENEWED", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Orders", exact: true }).last().click();
  await expect(page.getByRole("link", { name: "TOKEN-RENEWED", exact: true })).toBeVisible();
  await submitSearch(page);
  await expect(page.getByRole("link", { name: "TOKEN-RENEWED-SEARCH", exact: true })).toBeVisible();

  anonymousLabel = "ANONYMOUS-RETURN";
  await page.getByRole("button", { name: "Manage operator access token" }).click();
  await page.getByRole("button", { name: "Remove token" }).click();
  await page.getByRole("button", { name: "Close access token dialog" }).click();
  await expect(page.getByRole("link", { name: "ANONYMOUS-RETURN-SEARCH", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Clear projected order search" }).click();
  await expect(page.getByRole("link", { name: "ANONYMOUS-RETURN", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^TOKEN-/ })).toHaveCount(0);
  await page.getByRole("link", { name: "ANONYMOUS-RETURN", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ANONYMOUS-RETURN", exact: true })).toBeVisible();

  for (const token of [firstToken, renewedToken]) {
    for (const path of ["/api/v1/operator/orders", "/api/v1/operator/orders/search/status", "/api/v1/operator/orders/search", `/api/v1/operator/orders/${orderId}`]) {
      expect(requests).toContainEqual({ path, authorization: `Bearer ${token}` });
    }
  }
  expect(requests.filter(({ authorization }) => authorization === undefined).length).toBeGreaterThan(3);
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
  await expect(page.getByRole("heading", { name: "ORDER-E2E-001" })).toBeVisible();
});

test("inspects and replays an exhausted delivery with a platform-admin token", async ({ page }) => {
  let replayRequest: Request | undefined;
  await mockGatewayApi(page, (request) => {
    replayRequest = request;
  });
  await page.goto("/orders");

  const token = createOperatorToken(["platform-admin"]);
  await page.getByRole("button", { name: "Set operator access token" }).click();
  await page.getByRole("textbox", { name: "Access token" }).fill(token);
  await page.getByRole("button", { name: "Use token" }).click();

  await page.getByRole("link", { name: "Deliveries" }).click();
  await expect(page).toHaveURL("/deliveries");
  await expect(page.getByRole("link", { name: "DELIVERY-E2E-001" })).toBeVisible();

  await page.getByRole("link", { name: "DELIVERY-E2E-001" }).click();
  await expect(page).toHaveURL(`/deliveries/${deliveryId}`);
  await expect(page.getByText("Retryable failure")).toBeVisible();

  await page.getByRole("button", { name: "Request a new send attempt" }).click();
  await page.getByLabel("Reason").fill("The Core endpoint is available again");
  await page.getByRole("button", { name: "Confirm request" }).click();

  await expect(page.getByRole("dialog", { name: "Request a new send attempt" }).getByRole("status")).toContainText("Replay command");
  expect(replayRequest?.headers()["authorization"]).toBe(`Bearer ${token}`);
  expect(replayRequest?.headers()["idempotency-key"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  expect(replayRequest?.postDataJSON()).toEqual({ reason: "The Core endpoint is available again" });
});

test("makes delivery errors and attempt details readable and copyable on mobile", async ({ page }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 320, height: 800 });
  await mockGatewayApi(page);
  await page.goto("/orders");
  await applyToken(page, createOperatorToken(["platform-admin"]));
  await page.getByRole("link", { name: "Deliveries" }).click();
  const deliveryCards = page.getByRole("list", { name: "Deliveries" });
  await expect(deliveryCards).toContainText("CORE_UNAVAILABLE");
  await expect(page.getByRole("table")).toBeHidden();
  await page.getByRole("link", { name: "DELIVERY-E2E-001" }).click();

  await expect(page.getByRole("heading", { name: "Latest delivery error" })).toBeVisible();
  await expect(page.getByText("CORE_UNAVAILABLE", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("The Core endpoint did not respond before the timeout").first()).toBeVisible();
  await page.getByRole("button", { name: "Copy error code CORE_UNAVAILABLE" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Copied.")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("CORE_UNAVAILABLE");

  const attemptDetails = page.locator("details").filter({ has: page.getByText("Attempt 2") });
  await attemptDetails.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("The Core endpoint did not respond before the timeout").last()).toBeVisible();
  const deliveryDetails = page.locator("details").filter({ hasText: "No attempt is scheduled" });
  await deliveryDetails.locator("summary").click();
  await expect(page.getByText("No attempt is scheduled")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
});

test("links a known Core order from a delivered delivery and returns to it", async ({ page }) => {
  await mockOperatorApi(page);
  await mockGatewayApi(page);
  await page.route(`**/gateway-api/api/v1/operator/deliveries/${deliveryId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ...deliveryDetail,
        completedAt: "2026-09-12T12:05:01Z",
        lastCoreOrderId: orderId,
        nextAttemptAt: "2026-09-12T12:10:00Z",
        status: "DELIVERED",
      }),
    });
  });
  await page.goto("/orders");
  await applyToken(page, createOperatorToken(["platform-admin"]));
  await page.getByRole("link", { name: "Deliveries" }).click();
  await page.getByRole("link", { name: "DELIVERY-E2E-001" }).click();

  await expect(page.getByText("Delivered", { exact: true })).toBeVisible();
  const deliveryMetadata = page.locator("details").filter({ hasText: "No attempt is scheduled" });
  await deliveryMetadata.locator("summary").click();
  await expect(page.getByText("No attempt is scheduled")).toBeVisible();
  await page.getByRole("link", { name: orderId, exact: true }).click();
  await expect(page).toHaveURL(`/orders/${orderId}`);
  await expect(page.getByRole("link", { name: "Back to delivery" })).toHaveAttribute("href", `/deliveries/${deliveryId}`);
  await page.getByRole("link", { name: "Back to delivery" }).click();
  await expect(page).toHaveURL(`/deliveries/${deliveryId}`);
  await expect(page.getByText("Delivered", { exact: true })).toBeVisible();
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
  await expect(page.getByRole("list", { name: "Orders" }).getByRole("link", { name: "ORDER-E2E-001" })).toBeVisible();

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
  await expect(page.getByRole("region", { name: "Current active step details" }).getByText("ERP_B_UNSUPPORTED_CURRENCY")).toBeVisible();
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

for (const width of [390, 768]) {
  test(`shows the active recorded result before the collapsible sequence at ${width}px`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/flow-explorer");

    await expect(page.getByText("Playback does not show live activity.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "ERP_PAGE_REQUESTED" }).first()).toBeVisible();
    const expandSequence = page.getByRole("button", { name: "Show full sequence (10 steps)" });
    await expect(expandSequence).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: /Step 3, ERP_PAGE_COMMITTED/ })).toBeHidden();

    await expandSequence.click();
    await expect(page.getByRole("button", { name: /Step 3, ERP_PAGE_COMMITTED/ })).toBeVisible();
    const committedStep = page.getByRole("button", { name: /Step 3, ERP_PAGE_COMMITTED/ });
    await committedStep.focus();
    await page.keyboard.press("ArrowDown");
    const activeDetails = page.getByTestId("flow-timeline-active-details");
    await expect(page.getByRole("button", { name: /Step 4, CANONICAL_ORDER_FORWARDED/ })).toBeFocused();
    await expect(activeDetails).toContainText("HTTP_METHOD");

    await page.keyboard.press("End");
    await expect(page.getByRole("button", { name: /Step 10, SCENARIO_COMPLETED/ })).toBeFocused();
    await expect(activeDetails).toContainText("ORDER_STATUS");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
}

test("explores the System Map without mobile page overflow", async ({ page }) => {
  await page.goto("/system-map");

  await expect(page.getByRole("heading", { name: "System Map" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Integration Core" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Integration Core" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "OpenSearch" }).click();

  await expect(page.getByRole("complementary", { name: "OpenSearch" })).toContainText(
    "Provides a rebuildable read model for operational order search",
  );
  await expect(page.getByRole("link", { name: "Open technical reference" })).toHaveAttribute(
    "href",
    "https://github.com/PietroRussoD/commerce-integration-hub/blob/main/docs/decisions/0015-rebuildable-opensearch-order-projection.md",
  );

  await page.setViewportSize({ width: 320, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

async function mockOperatorApi(page: Page, onProjectedSearch?: (request: Request) => void) {
  await page.route("**/api/v1/operator/orders/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(orderDetail) });
  });
  await page.route("**/api/v1/operator/orders?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(orderPage) });
  });
  await page.route("**/api/v1/operator/orders/search?**", async (route) => {
    onProjectedSearch?.(route.request());
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(projectedOrderPage) });
  });
  await page.route("**/api/v1/operator/orders/search/status", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(searchProjectionStatus) });
  });
}

async function mockGatewayApi(page: Page, onReplay?: (request: Request) => void) {
  await page.route("**/gateway-api/api/v1/operator/deliveries?**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deliveryPage) });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deliveryDetail) });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
    onReplay?.(route.request());
    await route.fulfill({
      status: 202,
      contentType: "application/json",
      body: JSON.stringify({
        commandId: "26998c94-b78f-4e33-8a24-47a8b353b9b8",
        idempotent: false,
        outcome: "REPLAYED",
      }),
    });
  });
}

async function applyToken(page: Page, token: string) {
  await page.getByRole("button", { name: /^(Set|Manage) operator access token$/ }).click();
  await page.getByRole("textbox", { name: "Access token" }).fill(token);
  await page.getByRole("button", { name: "Use token" }).click();
}

async function submitSearch(page: Page) {
  const search = page.getByRole("searchbox", { name: "Search projected orders" });
  await expect(search).toBeEnabled();
  await search.fill("browser");
  await page.getByRole("button", { name: "Search projected orders" }).click();
}

async function expectReadableContrast(page: Page, selector: string) {
  await expect(page.locator(selector).first()).toBeVisible();
  const ratio = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector);
    if (target === null) throw new Error(`No element matched ${targetSelector}`);
    const parse = (value: string) => value.match(/[\d.]+/g)?.map(Number) ?? [];
    const luminance = (color: number[]) => {
      const linear = color.slice(0, 3).map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
    };
    const foreground = parse(getComputedStyle(target).color);
    let ancestor: Element | null = target;
    let background = [255, 255, 255];
    while (ancestor !== null) {
      const value = getComputedStyle(ancestor).backgroundColor;
      const channels = parse(value);
      if (channels.length >= 3 && channels[3] !== 0) {
        background = channels;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (light + 0.05) / (dark + 0.05);
  }, selector);
  expect(ratio, `${selector} contrast ratio`).toBeGreaterThanOrEqual(4.5);
}

function createOperatorToken(groups: string[], jti = "default"): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ sub: "operator-e2e", exp: 1_900_000_000, groups, jti })}.signature`;
}
