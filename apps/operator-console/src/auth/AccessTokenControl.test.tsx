import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { AppProviders } from "../app/AppProviders";
import { AccessTokenButton } from "./AccessTokenButton";
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
  expect(screen.getByLabelText("Access token")).toHaveAttribute("aria-describedby", "operator-access-token-help operator-access-token-error");
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

test("opens the shared dialog from an access error and explains unverified claims and memory policy", async () => {
  render(<AppProviders><AccessTokenControl /><AccessTokenButton /></AppProviders>);
  const trigger = screen.getByRole("button", { name: "Set or replace token" });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByLabelText("Access token")).toHaveFocus();
  expect(screen.getByText(/Reloading or closing the page removes it/)).toBeVisible();
  expect(screen.getByText(/Each service verifies the signature/)).toBeVisible();
  fireEvent.change(screen.getByLabelText("Access token"), { target: { value: createToken({ sub: "synthetic-user", exp: 2_000_000_000, groups: ["platform-admin", "unrecognized"] }) } });
  fireEvent.click(screen.getByRole("button", { name: "Use token" }));
  fireEvent.click(screen.getByRole("button", { name: "Manage operator access token" }));
  expect(screen.getByText("synthetic-user")).toBeVisible();
  expect(screen.getByText("platform-admin")).toBeVisible();
  expect(screen.queryByText("unrecognized")).not.toBeInTheDocument();
  expect(document.querySelector("time")).toHaveAttribute("datetime", new Date(2_000_000_000_000).toISOString());
});
