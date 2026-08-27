import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { StatusBadge } from "./StatusBadge";

afterEach(cleanup);

test.each([
  ["READY", "bg-emerald-50"],
  ["PROCESSING", "bg-amber-50"],
  ["FAILED", "bg-red-50"],
  ["UNKNOWN", "bg-zinc-100"],
])("uses the expected color for %s", (status, colorClassName) => {
  render(<StatusBadge status={status}>{status}</StatusBadge>);

  expect(screen.getByText(status)).toHaveClass(colorClassName);
});
