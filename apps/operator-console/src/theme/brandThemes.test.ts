import { describe, expect, test } from "vitest";

import { defaultBrandThemeId, resolveBrandThemeId } from "./brandThemes";

describe("resolveBrandThemeId", () => {
  test.each(["integration-hub", "client-blue"])("accepts the registered %s theme", (themeId) => {
    expect(resolveBrandThemeId(themeId)).toBe(themeId);
  });

  test("falls back to the default theme for an unknown value", () => {
    expect(resolveBrandThemeId("unknown-client")).toBe(defaultBrandThemeId);
  });
});
