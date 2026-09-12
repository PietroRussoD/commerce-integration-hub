import { type ReactNode, useCallback, useMemo, useState } from "react";

import { inspectAccessToken, type AccessTokenIdentity, type AccessTokenInspection } from "./accessToken";
import { AccessTokenContext } from "./accessTokenContext";

export function AccessTokenProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessTokenValue] = useState<string>();
  const [identity, setIdentity] = useState<AccessTokenIdentity>();

  const clearAccessToken = useCallback(() => {
    setAccessTokenValue(undefined);
    setIdentity(undefined);
  }, []);

  const setAccessToken = useCallback((candidate: string): AccessTokenInspection => {
    const inspection = inspectAccessToken(candidate.trim());

    if (inspection.kind === "active") {
      setAccessTokenValue(candidate.trim());
      setIdentity(inspection.identity);
    } else {
      setAccessTokenValue(undefined);
      setIdentity(undefined);
    }

    return inspection;
  }, []);

  const value = useMemo(
    () => ({ accessToken, identity, clearAccessToken, setAccessToken }),
    [accessToken, clearAccessToken, identity, setAccessToken],
  );

  return <AccessTokenContext.Provider value={value}>{children}</AccessTokenContext.Provider>;
}
