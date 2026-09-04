import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, test } from "vitest";

import { AppProviders } from "./AppProviders";
import { createAppRoutes } from "./router";
import { createAppI18n, localeStorageKey } from "../i18n/i18n";
import { expectNoAccessibilityViolations } from "../test/accessibility";
import { resolveBrandThemeForHostname } from "../theme/brandThemes";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.lang = "en";
});

test("renders navigation inside the operator shell", async () => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: ["/simulator"] });

  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  expect(await screen.findByRole("heading", { name: "Simulator" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
  expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  expect(screen.getByRole("main")).toHaveAttribute("tabindex", "-1");
  expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders");
  expect(screen.getByRole("link", { name: "Flow Explorer" })).toHaveAttribute("href", "/flow-explorer");
  expect(screen.getByRole("link", { name: "Simulator" })).toHaveAttribute("aria-current", "page");
});

test("moves focus to the main content after route navigation", async () => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: ["/simulator"] });

  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  expect(await screen.findByRole("heading", { name: "Simulator" })).toBeInTheDocument();
  expect(screen.getByRole("main")).not.toHaveFocus();

  fireEvent.click(screen.getByRole("link", { name: "Orders" }));

  expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveFocus();
});

test("renders the order detail route inside the operator shell", async () => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: ["/orders/order-42"] });

  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  expect(await screen.findByRole("heading", { name: "Order details" })).toBeInTheDocument();
  expect(screen.getByText("order-42")).toBeInTheDocument();
  expect(within(screen.getByRole("navigation", { name: "Primary navigation" })).getByRole("link", { name: "Orders" })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("renders the client identity supplied to the operator shell", async () => {
  const clientTheme = resolveBrandThemeForHostname("client-blue.localhost");
  const router = createMemoryRouter(createAppRoutes(clientTheme), { initialEntries: ["/simulator"] });

  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  expect(await screen.findByText("Client Blue")).toBeInTheDocument();
  expect(screen.getByText("Commerce operations")).toBeInTheDocument();
});

test("renders shell navigation in Italian when supplied with the Italian locale", async () => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: ["/simulator"] });

  render(
    <AppProviders i18nInstance={createAppI18n("it")}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  const navigation = await screen.findByRole("navigation", { name: "Navigazione principale" });
  expect(within(navigation).getByRole("link", { name: "Ordini" })).toHaveAttribute("href", "/orders");
  expect(within(navigation).getByRole("link", { name: "Esplorazione flussi" })).toHaveAttribute(
    "href",
    "/flow-explorer",
  );
  expect(within(navigation).getByRole("link", { name: "Simulatore" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByText("Console operativa")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Vai al contenuto principale" })).toHaveAttribute("href", "#main-content");
});

test("changes and persists the operator locale", async () => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: ["/simulator"] });

  render(
    <AppProviders i18nInstance={createAppI18n("en")}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  expect(await screen.findByRole("heading", { name: "Simulator" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");

  fireEvent.click(screen.getByRole("button", { name: "Italian" }));

  expect(await screen.findByRole("heading", { name: "Simulatore" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Italiano" })).toHaveAttribute("aria-pressed", "true");
  expect(window.localStorage.getItem(localeStorageKey)).toBe("it");
  expect(document.documentElement).toHaveAttribute("lang", "it");
});

test("has no automatically detectable accessibility violations in the application shell", async () => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: ["/simulator"] });
  const { container } = render(
    <AppProviders i18nInstance={createAppI18n("en")}>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  expect(await screen.findByRole("heading", { name: "Simulator" })).toBeInTheDocument();
  await expectNoAccessibilityViolations(container);
});
