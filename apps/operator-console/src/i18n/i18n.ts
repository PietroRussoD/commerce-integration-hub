import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";

import commonEn from "../locales/en/common.json";
import commonIt from "../locales/it/common.json";

export const supportedLocales = ["en", "it"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];
export const localeStorageKey = "operator-console.locale";

const intlLocales: Record<SupportedLocale, string> = {
  en: "en-GB",
  it: "it-IT",
};

export function resolveSupportedLocale(value: unknown): SupportedLocale {
  return supportedLocales.includes(value as SupportedLocale) ? (value as SupportedLocale) : "en";
}

export function resolveIntlLocale(language: string | undefined): string {
  const locale = supportedLocales.find((candidate) => language === candidate || language?.startsWith(`${candidate}-`));
  return intlLocales[locale ?? "en"];
}

export function readStoredLocale(storage: Pick<Storage, "getItem"> | undefined): SupportedLocale {
  try {
    const storedLocale = storage?.getItem(localeStorageKey);
    return resolveSupportedLocale(storedLocale);
  } catch {
    return "en";
  }
}

export function storeLocale(storage: Pick<Storage, "setItem"> | undefined, locale: SupportedLocale): void {
  try {
    storage?.setItem(localeStorageKey, locale);
  } catch {
    // The language still changes when browser storage is unavailable.
  }
}

export function readBrowserLocale(): SupportedLocale {
  return readStoredLocale(getBrowserStorage());
}

export function storeBrowserLocale(locale: SupportedLocale): void {
  storeLocale(getBrowserStorage(), locale);
}

function getBrowserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function createAppI18n(locale: SupportedLocale = "en"): i18n {
  const instance = createInstance();

  void instance.use(initReactI18next).init({
    resources: {
      en: { common: commonEn },
      it: { common: commonIt },
    },
    lng: locale,
    fallbackLng: "en",
    supportedLngs: supportedLocales,
    load: "languageOnly",
    defaultNS: "common",
    ns: ["common"],
    initAsync: false,
    interpolation: {
      escapeValue: false,
    },
  });

  return instance;
}

export const appI18n = createAppI18n();
