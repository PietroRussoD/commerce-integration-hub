import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type i18n } from "i18next";
import { type ReactNode, useEffect } from "react";
import { I18nextProvider, useTranslation } from "react-i18next";

import { AccessTokenProvider } from "../auth/AccessTokenProvider";
import { appI18n, resolveSupportedLocale } from "../i18n/i18n";

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 15_000,
      },
    },
  });
}

const queryClient = createQueryClient();

export function AppProviders({ children, i18nInstance = appI18n }: { children: ReactNode; i18nInstance?: i18n }) {
  return (
    <I18nextProvider i18n={i18nInstance} defaultNS="common">
      <DocumentLocale />
      <QueryClientProvider client={queryClient}>
        <AccessTokenProvider>{children}</AccessTokenProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function DocumentLocale() {
  const { i18n } = useTranslation();
  const locale = resolveSupportedLocale(i18n.resolvedLanguage);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
