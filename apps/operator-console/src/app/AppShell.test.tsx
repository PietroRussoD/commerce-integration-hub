import { cleanup, render, screen, within } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, expect, test } from "vitest";

import { AppProviders } from "./AppProviders";
import { appRoutes } from "./router";

afterEach(cleanup);

test("renders navigation inside the operator shell", async () => {
  const router = createMemoryRouter(appRoutes, { initialEntries: ["/simulator"] });

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
  const router = createMemoryRouter(appRoutes, { initialEntries: ["/orders/order-42"] });

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
