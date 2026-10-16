import { expect, test, type Locator, type Page } from "@playwright/test";

import { deliveryDetail, deliveryId, orderPage, searchProjectionStatus } from "./fixtures";

// All API responses and credentials in these tests are synthetic.
for (const viewport of [{ width: 1440, height: 900 }, { width: 768, height: 1024 }, { width: 320, height: 740 }]) {
  test(`token dialog supports keyboard and validation at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockReads(page);
    await page.goto("/orders");
    const trigger = page.getByRole("button", { name: "Set operator access token" });
    await trigger.click();
    const dialog = page.getByRole("dialog", { name: "Operator access token" });
    const field = dialog.getByLabel("Access token", { exact: true });
    const close = dialog.getByRole("button", { name: "Close access token dialog" });
    const submit = dialog.getByRole("button", { name: "Use token" });
    await expect(field).toBeFocused();
    await assertModalKeyboard(page, dialog, close, submit);
    await field.fill("invalid-token");
    await submit.click();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await expect(field).toHaveAttribute("aria-describedby", "operator-access-token-error");
    await expect(dialog.getByRole("alert")).toHaveText("The access token format is invalid");
    await field.fill(token());
    await expect(field).not.toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();

    await trigger.click();
    await field.fill(token());
    await submit.click();
    const manage = page.getByRole("button", { name: "Manage operator access token" });
    await expect(manage).toBeFocused();
    await manage.click();
    await assertModalKeyboard(page, dialog, close, submit);
    await dialog.getByRole("button", { name: "Remove token" }).click();
    await close.click();
    await expect(trigger).toBeFocused();
  });

  test(`replay dialog supports keyboard, pending and accepted states at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockReads(page);
    let resolveReplay!: () => void;
    const replayGate = new Promise<void>((resolve) => { resolveReplay = resolve; });
    await page.route("**/gateway-api/api/v1/operator/deliveries/*/replay", async (route) => {
      await replayGate;
      await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({
        commandId: "c3d6bc5d-03ee-4c68-a322-f2f67b6e4f21", idempotent: false, outcome: "REPLAYED",
      }) });
    });
    try {
      await page.goto(`/deliveries/${deliveryId}`);
      await page.getByRole("button", { name: "Set operator access token" }).click();
      await page.getByLabel("Access token", { exact: true }).fill(token());
      await page.getByRole("button", { name: "Use token" }).click();
      const trigger = page.getByRole("button", { name: "Replay delivery", exact: true });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      const reason = dialog.getByLabel("Reason");
      const close = dialog.getByRole("button", { name: "Close replay delivery dialog" });
      const submit = dialog.getByRole("button", { name: "Confirm replay" });
      await expect(reason).toBeFocused();
      await assertModalKeyboard(page, dialog, close, submit);
      await submit.click();
      await expect(reason).toBeFocused();
      await expect(reason).toHaveAttribute("aria-invalid", "true");
      await expect(reason).toHaveAttribute("aria-describedby", "delivery-replay-reason-error");
      await expect(dialog.getByRole("alert")).toHaveText("A replay reason is required");
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await trigger.click();
      await reason.fill("Synthetic recovery check");
      await submit.click();
      await expect(reason).toBeDisabled();
      await expect(close).toBeFocused();
      await assertModalKeyboard(page, dialog, close, close);
      resolveReplay();
      await expect(dialog.getByRole("status")).toContainText("was accepted");
      await expect(close).toBeFocused();
      await assertModalKeyboard(page, dialog, close, close);
      await page.setViewportSize({ width: 320, height: 350 });
      await assertFitsViewport(page, dialog);
      await close.click();
      await expect(trigger).toBeFocused();
    } finally {
      resolveReplay();
    }
  });
}

async function assertModalKeyboard(page: Page, dialog: Locator, first: Locator, last: Locator) {
  await expect(dialog).toHaveJSProperty("open", true);
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await last.focus();
  await page.keyboard.press("Tab");
  await expect(first).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(last).toBeFocused();
  // A native modal must also reject programmatic focus on the background.
  await page.getByRole("button", { name: "English", exact: true, includeHidden: true }).evaluate((element) => element.focus());
  await expect(last).toBeFocused();
  await assertFitsViewport(page, dialog);
}

async function assertFitsViewport(page: Page, dialog: Locator) {
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

async function mockReads(page: Page) {
  await page.route("**/api/v1/operator/orders**", async (route) => {
    const body = new URL(route.request().url()).pathname.endsWith("/search/status") ? searchProjectionStatus : orderPage;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  await page.route("**/gateway-api/api/v1/operator/deliveries/*", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(deliveryDetail) });
  });
}

function token() {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode({ sub: "synthetic-dialog-operator", exp: 2_000_000_000, groups: ["platform-admin"] })}.signature`;
}
