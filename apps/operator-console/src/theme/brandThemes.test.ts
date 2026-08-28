import { describe, expect, test } from "vitest";

import {
  applyBrandThemeToDocument,
  defaultBrandTheme,
  defaultBrandThemeId,
  resolveBrandThemeForHostname,
  resolveBrandThemeId,
} from "./brandThemes";

describe("resolveBrandThemeId", () => {
  test.each(["integration-hub", "client-blue"])("accepts the registered %s theme", (themeId) => {
    expect(resolveBrandThemeId(themeId)).toBe(themeId);
  });

  test("falls back to the default theme for an unknown value", () => {
    expect(resolveBrandThemeId("unknown-client")).toBe(defaultBrandThemeId);
  });
});

describe("resolveBrandThemeForHostname", () => {
  test.each(["client-blue.localhost", " CLIENT-BLUE.LOCALHOST. "])("resolves the client brand for %s", (hostname) => {
    expect(resolveBrandThemeForHostname(hostname).id).toBe("client-blue");
  });

  test("uses the default brand for an unregistered hostname", () => {
    expect(resolveBrandThemeForHostname("operator.example.test")).toBe(defaultBrandTheme);
  });
});

test("applies brand identity to the document", () => {
  document.head.innerHTML = '<meta name="theme-color" content="#000000"><link rel="icon" href="/favicon.svg">';
  const clientTheme = resolveBrandThemeForHostname("client-blue.localhost");

  applyBrandThemeToDocument(clientTheme, document);

  expect(document.documentElement.dataset.brand).toBe("client-blue");
  expect(document.title).toBe("Client Blue Commerce Operations");
  expect(document.querySelector('link[rel="icon"]')).toHaveAttribute("href", "/client-blue.svg");
  expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute("content", "#1e3a8a");
});
