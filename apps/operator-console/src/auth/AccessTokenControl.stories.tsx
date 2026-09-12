import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { AccessTokenControl } from "./AccessTokenControl";
import { AccessTokenProvider } from "./AccessTokenProvider";

const meta = {
  title: "Authentication/AccessTokenControl",
  component: AccessTokenControl,
  tags: ["autodocs"],
  parameters: { layout: "padded" },
  decorators: [
    (Story) => (
      <AccessTokenProvider>
        <Story />
      </AccessTokenProvider>
    ),
  ],
} satisfies Meta<typeof AccessTokenControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unauthenticated: Story = {};

export const InvalidToken: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Set operator access token" }));

    const dialog = within(document.body).getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Access token"), "not-a-token");
    await userEvent.click(within(dialog).getByRole("button", { name: "Use token" }));

    await expect(within(dialog).getByRole("alert")).toHaveTextContent("The access token format is invalid");
  },
};

export const Authenticated: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Set operator access token" }));

    const dialog = within(document.body).getByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Access token"), createToken("operator-42"));
    await userEvent.click(within(dialog).getByRole("button", { name: "Use token" }));

    await expect(canvas.getByRole("button", { name: "Manage operator access token" })).toBeInTheDocument();
  },
};

function createToken(subject: string): string {
  return [{ alg: "RS256", typ: "JWT" }, { sub: subject, exp: 2_000_000_000 }, "signature"]
    .map((segment) => btoa(JSON.stringify(segment)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""))
    .join(".");
}
