import { expect, test, type Page } from "@playwright/test";

import { deliveryPage, orderPage, searchProjectionStatus } from "./fixtures";

for (const theme of [
  { id: "integration-hub", host: "127.0.0.1" },
  { id: "client-blue", host: "client-blue.localhost" },
]) {
  test(`keeps informative text above 4.5:1 in the ${theme.id} theme`, async ({ page }) => {
    await page.route("**/api/v1/operator/orders**", async (route) => {
      const body = new URL(route.request().url()).pathname.endsWith("/search/status")
        ? searchProjectionStatus
        : orderPage;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.route("**/gateway-api/api/v1/operator/deliveries?**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...deliveryPage,
          items: deliveryPage.items.map((delivery) => ({ ...delivery, errorCode: null })),
        }),
      });
    });

    await page.goto(`http://${theme.host}:4173/orders`);
    await expect(page.locator("html")).toHaveAttribute("data-brand", theme.id);
    const placeholderColors = await page.getByRole("searchbox", { name: "Search projected orders" }).evaluate((input) => ({
      foreground: getComputedStyle(input, "::placeholder").color,
      background: getComputedStyle(input).backgroundColor,
    }));
    const placeholderRatio = contrastRatio(placeholderColors.foreground, placeholderColors.background);
    expect(placeholderRatio, "search placeholder contrast ratio").toBeGreaterThanOrEqual(4.5);

    await page.getByRole("button", { name: "Set operator access token" }).click();
    await page.getByLabel("Access token", { exact: true }).fill(createOperatorToken());
    await page.getByRole("button", { name: "Use token" }).click();
    await page.getByRole("link", { name: "Deliveries", exact: true }).click();
    await expect(page.getByRole("link", { name: "DELIVERY-E2E-001" })).toBeVisible();
    await expectReadableContrast(page, "td p.font-mono.text-xs");
    await expectReadableContrast(page, "td span:text-is('No error recorded')");

    const faintText = await page.locator(".text-app-foreground-faint").evaluateAll((elements) =>
      elements.filter((element) => element.tagName.toLowerCase() !== "svg" && (element.textContent?.trim().length ?? 0) > 0)
        .map((element) => element.textContent?.trim()),
    );
    expect(faintText, "faint color is reserved for decorative icons").toEqual([]);
  });
}

async function expectReadableContrast(page: Page, selector: string) {
  const colors = await page.locator(selector).evaluate((element) => {
    let ancestor: Element | null = element;
    let background = "rgb(255, 255, 255)";
    while (ancestor !== null) {
      const color = getComputedStyle(ancestor).backgroundColor;
      if (color !== "rgba(0, 0, 0, 0)") {
        background = color;
        break;
      }
      ancestor = ancestor.parentElement;
    }
    return { foreground: getComputedStyle(element).color, background };
  });
  const ratio = contrastRatio(colors.foreground, colors.background);
  expect(ratio, `${selector} contrast ratio`).toBeGreaterThanOrEqual(4.5);
}

function contrastRatio(foreground: string, background: string) {
  const channels = (color: string) => color.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [];
  const luminance = (color: string) => {
    const [red, green, blue] = channels(color).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
  };
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (light! + 0.05) / (dark! + 0.05);
}

function createOperatorToken() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ sub: "synthetic-contrast-check", exp: 2_000_000_000, groups: ["operator"] })}.signature`;
}
