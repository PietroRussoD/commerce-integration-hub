import { createContext, useContext } from "react";

import type { AccessTokenIdentity, AccessTokenInspection } from "./accessToken";

export interface AccessTokenContextValue {
  cacheScope: string;
  accessToken: string | undefined;
  identity: AccessTokenIdentity | undefined;
  clearAccessToken: () => void;
  setAccessToken: (candidate: string) => AccessTokenInspection;
}

export const AccessTokenContext = createContext<AccessTokenContextValue | undefined>(undefined);

export function useAccessToken(): AccessTokenContextValue {
  const value = useContext(AccessTokenContext);
  if (value === undefined) throw new Error("useAccessToken must be used within AccessTokenProvider");

  return value;
}
