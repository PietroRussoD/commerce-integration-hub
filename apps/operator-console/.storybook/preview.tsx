import type { Preview } from "@storybook/react-vite";
import { I18nextProvider } from "react-i18next";

import { createAppI18n, resolveSupportedLocale, supportedLocales } from "../src/i18n/i18n";
import { brandThemes, defaultBrandThemeId, resolveBrandThemeId } from "../src/theme/brandThemes";
import "../src/styles.css";

const storybookI18n = {
  en: createAppI18n("en"),
  it: createAppI18n("it"),
};

const preview: Preview = {
  decorators: [
    (Story, context) => {
      const locale = resolveSupportedLocale(context.globals.locale);

      return (
        <I18nextProvider i18n={storybookI18n[locale]} defaultNS="common">
          <div
            lang={locale}
            data-brand={resolveBrandThemeId(context.globals.brand)}
            className="min-h-full bg-app-canvas text-app-foreground"
          >
            <Story />
          </div>
        </I18nextProvider>
      );
    },
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
    locale: {
      description: "Locale applied to component stories",
      toolbar: {
        title: "Locale",
        icon: "globe",
        items: supportedLocales.map((locale) => ({ value: locale, title: locale.toUpperCase() })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    brand: defaultBrandThemeId,
    locale: "en",
  },
  parameters: {
    a11y: {
      test: "error",
    },
    layout: "centered",
  },
};

export default preview;
