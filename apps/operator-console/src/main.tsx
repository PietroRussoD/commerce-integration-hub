import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppProviders } from "./app/AppProviders";
import { createAppRoutes } from "./app/router";
import { createAppI18n, readBrowserLocale } from "./i18n/i18n";
import { applyBrandThemeToDocument, resolveBrandThemeForHostname } from "./theme/brandThemes";
import "./styles.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Root element not found");
}

const brandTheme = resolveBrandThemeForHostname(window.location.hostname);
applyBrandThemeToDocument(brandTheme, document);
const i18n = createAppI18n(readBrowserLocale());
const router = createBrowserRouter(createAppRoutes(brandTheme));

createRoot(rootElement).render(
  <StrictMode>
    <AppProviders i18nInstance={i18n}>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
