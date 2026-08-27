import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RefreshCw } from "lucide-react";
import { afterEach, expect, test, vi } from "vitest";

import { IconButton } from "./IconButton";

afterEach(cleanup);

test("provides an accessible label and invokes its action", () => {
  const onClick = vi.fn();

  render(
    <IconButton label="Refresh orders" onClick={onClick}>
      <RefreshCw aria-hidden="true" />
    </IconButton>,
  );

  const button = screen.getByRole("button", { name: "Refresh orders" });
  expect(button).toHaveAttribute("title", "Refresh orders");

  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledOnce();
});
