import { type ReactNode, useCallback, useMemo, useState } from "react";

import { inspectAccessToken, type AccessTokenIdentity, type AccessTokenInspection } from "./accessToken";
import { AccessTokenContext } from "./accessTokenContext";

interface AccessTokenSession {
  accessToken?: string;
  identity?: AccessTokenIdentity;
  cacheScope: string;
}

export function AccessTokenProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AccessTokenSession>(() => ({ cacheScope: crypto.randomUUID() }));

  const clearAccessToken = useCallback(() => {
    setSession((current) =>
      current.accessToken === undefined ? current : { cacheScope: crypto.randomUUID() },
    );
  }, []);

  const setAccessToken = useCallback((candidate: string): AccessTokenInspection => {
    const inspection = inspectAccessToken(candidate.trim());

    if (inspection.kind === "active") {
      // Never put credentials in query keys. A fresh scope also isolates renewed
      // tokens for the same subject and prevents reuse when returning to anonymous access.
      setSession((current) => current.accessToken === candidate.trim()
        ? current
        : {
            accessToken: candidate.trim(),
            identity: inspection.identity,
            cacheScope: crypto.randomUUID(),
          },
      );
    } else {
      clearAccessToken();
    }

    return inspection;
  }, [clearAccessToken]);

  const value = useMemo(
    () => ({
      accessToken: session.accessToken,
      identity: session.identity,
      cacheScope: session.cacheScope,
      clearAccessToken,
      setAccessToken,
    }),
    [clearAccessToken, session, setAccessToken],
  );

  return <AccessTokenContext.Provider value={value}>{children}</AccessTokenContext.Provider>;
}
