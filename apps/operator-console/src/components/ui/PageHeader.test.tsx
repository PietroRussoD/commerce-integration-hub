import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { PageHeader } from "./PageHeader";

afterEach(cleanup);

test("renders its title, supporting content, navigation, and actions", () => {
  render(
    <PageHeader
      titleId="orders-heading"
      title="Orders"
      description="42 total"
      navigation={<a href="/">Workspace</a>}
      actions={<button type="button">Refresh</button>}
    />,
  );

  expect(screen.getByRole("heading", { name: "Orders" })).toHaveAttribute("id", "orders-heading");
  expect(screen.getByText("42 total")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Workspace" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
});
