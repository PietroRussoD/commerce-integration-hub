import { render, screen } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { expect, test } from "vitest";

import { appRoutes } from "./router";

test("renders the orders route inside the operator shell", async () => {
  const router = createMemoryRouter(appRoutes, { initialEntries: ["/orders"] });

  render(<RouterProvider router={router} />);

  expect(await screen.findByRole("heading", { name: "Orders" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Orders" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Simulator" })).toHaveAttribute("href", "/simulator");
});
