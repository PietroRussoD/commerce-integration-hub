import { expect, test } from "@playwright/test";

test("system-map controls remain visible and keyboard-operable in forced-colors mode", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ forcedColors: "active" });
  await page.goto("/system-map");

  await expect(page.getByRole("heading", { name: "System Map" })).toBeVisible();
  const navigation = page.getByRole("navigation", { name: "Primary navigation" });
  const firstLink = navigation.getByRole("link", { name: "Orders" });
  const gatewayNode = page.getByRole("button", { name: "Connector Gateway", exact: true });

  await firstLink.focus();
  await page.keyboard.press("Tab");
  await gatewayNode.focus();
  await expect(gatewayNode).toBeFocused();
  await expect(gatewayNode).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(gatewayNode).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
