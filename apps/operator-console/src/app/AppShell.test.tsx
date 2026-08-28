import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, test } from "vitest";

import { AppProviders } from "./AppProviders";
import { createAppRoutes } from "./router";
import { resolveBrandThemeForHostname } from "../theme/brandThemes";

afterEach(cleanup);

test("renders navigation inside the operator shell", async () => {
  const router = createMemoryRouter(createAppRoutes(), { initialEntries: ["/simulator"] });

  render(
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>,
  );

  expect(await screen.findByRole("heading", { name: "Simulator" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("href", "/orders");
  expect(screen.getByRole("link", { name: "Simulator" })).toHaveAttribute("aria-current", "page");
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
  expect(within(screen.getByRole("navigation", { name: "Primary" })).getByRole("link", { name: "Orders" })).toHaveAttribute(
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
