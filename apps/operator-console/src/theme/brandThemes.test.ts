import { describe, expect, test } from "vitest";

import { defaultBrandThemeId, resolveBrandThemeForHostname, resolveBrandThemeId } from "./brandThemes";

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
    expect(resolveBrandThemeForHostname(hostname)).toBe("client-blue");
  });

  test("uses the default brand for an unregistered hostname", () => {
    expect(resolveBrandThemeForHostname("operator.example.test")).toBe(defaultBrandThemeId);
  });
});
