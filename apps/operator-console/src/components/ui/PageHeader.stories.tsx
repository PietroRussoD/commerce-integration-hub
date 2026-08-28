import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { IconButton } from "./IconButton";
import { PageHeader } from "./PageHeader";

const meta = {
  title: "UI/PageHeader",
  component: PageHeader,
  tags: ["autodocs"],
  parameters: {
    layout: "padded",
  },
  args: {
    description: "42 total",
    title: "Orders",
    titleId: "storybook-page-heading",
  },
  argTypes: {
    actions: { control: false },
    navigation: { control: false },
  },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithActions: Story = {
  args: {
    actions: (
      <IconButton label="Refresh orders">
        <RefreshCw aria-hidden="true" size={17} />
      </IconButton>
    ),
  },
};

export const WithNavigation: Story = {
  args: {
    description: <span className="font-mono text-xs">fad69137-2417-449d-9aa6-63f2fe2dd362</span>,
    navigation: (
      <a
        href="#orders"
        className="inline-flex items-center gap-2 text-sm font-medium text-app-foreground-secondary hover:text-app-foreground"
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Orders
      </a>
    ),
    title: "Order details",
  },
};

export const Localized: Story = {
  render: () => <LocalizedPageHeader />,
};

function LocalizedPageHeader() {
  const { t } = useTranslation();

  return (
    <PageHeader
      titleId="storybook-localized-page-heading"
      title={t("orders.title")}
      description={t("orders.total", { count: 42 })}
      actions={
        <IconButton label={t("orders.actions.refresh")}>
          <RefreshCw aria-hidden="true" size={17} />
        </IconButton>
      }
    />
  );
}
