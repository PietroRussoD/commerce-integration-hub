import { expect, test } from "vitest";

import commonEn from "../locales/en/common.json";
import commonIt from "../locales/it/common.json";

test("English and Italian catalogs expose the same translation keys", () => {
  expect(collectLeafKeys(commonIt)).toEqual(collectLeafKeys(commonEn));
});

function collectLeafKeys(value: object, prefix = ""): string[] {
  return Object.entries(value)
    .flatMap(([key, child]) => {
      const path = prefix.length === 0 ? key : `${prefix}.${key}`;
      return typeof child === "object" && child !== null ? collectLeafKeys(child, path) : [path];
    })
    .sort();
}
