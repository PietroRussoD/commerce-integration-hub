import { expect, test, vi } from "vitest";

import commonEn from "../locales/en/common.json";
import commonIt from "../locales/it/common.json";
import { localeStorageKey, readStoredLocale, resolveSupportedLocale, storeLocale } from "./i18n";

test("English and Italian catalogs expose the same translation keys", () => {
  expect(collectLeafKeys(commonIt)).toEqual(collectLeafKeys(commonEn));
});

test("reads only supported locales from storage", () => {
  expect(readStoredLocale({ getItem: () => "it" })).toBe("it");
  expect(readStoredLocale({ getItem: () => "fr" })).toBe("en");
  expect(readStoredLocale({ getItem: () => null })).toBe("en");
  expect(readStoredLocale({ getItem: () => { throw new Error("storage unavailable"); } })).toBe("en");
});

test("resolves supported locale values with an English fallback", () => {
  expect(resolveSupportedLocale("it")).toBe("it");
  expect(resolveSupportedLocale("en")).toBe("en");
  expect(resolveSupportedLocale("fr")).toBe("en");
  expect(resolveSupportedLocale(undefined)).toBe("en");
});

test("stores the selected locale without failing when storage is unavailable", () => {
  const setItem = vi.fn();
  storeLocale({ setItem }, "it");
  expect(setItem).toHaveBeenCalledWith(localeStorageKey, "it");

  expect(() => storeLocale({ setItem: () => { throw new Error("storage unavailable"); } }, "en")).not.toThrow();
});

function collectLeafKeys(value: object, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) => {
      const path = prefix.length === 0 ? key : `${prefix}.${key}`;
      return typeof child === "object" && child !== null ? collectLeafKeys(child, path) : [path];
    })
    .sort();
}
