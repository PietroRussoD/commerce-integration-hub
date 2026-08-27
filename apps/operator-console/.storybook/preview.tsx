import type { Preview } from "@storybook/react-vite";

import { brandThemes, defaultBrandThemeId, resolveBrandThemeId } from "../src/theme/brandThemes";
import "../src/styles.css";

const preview: Preview = {
  decorators: [
    (Story, context) => (
      <div
        data-brand={resolveBrandThemeId(context.globals.brand)}
        className="min-h-full bg-app-canvas text-app-foreground"
      >
        <Story />
      </div>
    ),
  ],
  globalTypes: {
    brand: {
      description: "Brand applied to component stories",
      toolbar: {
        title: "Brand",
        icon: "paintbrush",
        items: brandThemes.map(({ id, label }) => ({ value: id, title: label })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    brand: defaultBrandThemeId,
  },
  parameters: {
    a11y: {
      test: "error",
    },
    layout: "centered",
  },
};

export default preview;
