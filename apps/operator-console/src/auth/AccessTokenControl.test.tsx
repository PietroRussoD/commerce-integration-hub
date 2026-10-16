import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { AppProviders } from "../app/AppProviders";
import { AccessTokenControl } from "./AccessTokenControl";

afterEach(cleanup);

test("keeps an active token in memory and reveals token management", () => {
  renderControl();

  fireEvent.click(screen.getByRole("button", { name: "Set operator access token" }));
  fireEvent.change(screen.getByLabelText("Access token"), { target: { value: createToken({ sub: "operator-42", exp: 1_800_000_000 }) } });
  fireEvent.click(screen.getByRole("button", { name: "Use token" }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Manage operator access token" })).toBeInTheDocument();
});

test("shows a validation message and does not retain an invalid token", () => {
  renderControl();

  fireEvent.click(screen.getByRole("button", { name: "Set operator access token" }));
  fireEvent.change(screen.getByLabelText("Access token"), { target: { value: "not-a-token" } });
  fireEvent.click(screen.getByRole("button", { name: "Use token" }));

  expect(screen.getByRole("alert")).toHaveTextContent("The access token format is invalid");
  expect(screen.getByLabelText("Access token")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByLabelText("Access token")).toHaveAttribute("aria-describedby", "operator-access-token-error");
  expect(screen.getByLabelText("Access token")).toHaveFocus();
  expect(screen.getByRole("button", { name: "Set operator access token" })).toBeInTheDocument();
});

test("focuses the token field and restores the trigger after native cancellation", async () => {
  renderControl();
  const trigger = screen.getByRole("button", { name: "Set operator access token" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByLabelText("Access token")).toHaveFocus();
  expect(document.body.style.overflow).toBe("hidden");

  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));

  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(document.body.style.overflow).toBe("");
});

test("removes a configured token when requested", () => {
  renderControl();

  fireEvent.click(screen.getByRole("button", { name: "Set operator access token" }));
  fireEvent.change(screen.getByLabelText("Access token"), { target: { value: createToken({ sub: "operator-42", exp: 1_800_000_000 }) } });
  fireEvent.click(screen.getByRole("button", { name: "Use token" }));
  fireEvent.click(screen.getByRole("button", { name: "Manage operator access token" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove token" }));

  expect(screen.getByRole("button", { name: "Set operator access token" })).toBeInTheDocument();
});

function renderControl() {
  return render(
    <AppProviders>
      <AccessTokenControl />
    </AppProviders>,
  );
}

function createToken(payload: object): string {
  const header = { alg: "RS256", typ: "JWT" };
  return [header, payload, "signature"]
    .map((segment) => btoa(JSON.stringify(segment)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""))
    .join(".");
}
