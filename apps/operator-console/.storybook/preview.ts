import type { Preview } from "@storybook/react-vite";

import "../src/styles.css";

const preview: Preview = {
  parameters: {
    a11y: {
      test: "error",
    },
    layout: "centered",
  },
};

export default preview;
