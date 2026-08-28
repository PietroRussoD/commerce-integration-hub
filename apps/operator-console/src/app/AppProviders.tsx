import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type i18n } from "i18next";
import { type ReactNode } from "react";
import { I18nextProvider } from "react-i18next";

import { appI18n } from "../i18n/i18n";

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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nextProvider>
  );
}
