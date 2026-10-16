import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";

import { inspectAccessToken, type AccessTokenIdentity, type AccessTokenInspection } from "./accessToken";
import { AccessTokenDialogProvider } from "./AccessTokenDialogProvider";
import { AccessTokenContext } from "./accessTokenContext";

interface AccessTokenSession {
  accessToken?: string;
  identity?: AccessTokenIdentity;
  cacheScope: string;
  hasExpired?: boolean;
}

export function AccessTokenProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AccessTokenSession>(() => ({ cacheScope: crypto.randomUUID() }));

  useEffect(() => {
    if (session.identity === undefined) return;
    const expiresAt = session.identity.expiresAt.getTime();
    let timer: number;
    const check = () => {
      window.clearTimeout(timer);
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) {
        // A late timer must never clear a replacement session or cancel a POST.
        setSession((current) => current.cacheScope === session.cacheScope
          ? { cacheScope: crypto.randomUUID(), hasExpired: true }
          : current);
      } else {
        timer = window.setTimeout(check, Math.min(remaining, 2_147_483_647));
      }
    };
    timer = window.setTimeout(check, Math.min(Math.max(0, expiresAt - Date.now()), 2_147_483_647));
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [session]);

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
      hasExpired: session.hasExpired === true,
      clearAccessToken,
      setAccessToken,
    }),
    [clearAccessToken, session, setAccessToken],
  );

  return (
    <AccessTokenContext.Provider value={value}>
      <AccessTokenDialogProvider>{children}</AccessTokenDialogProvider>
    </AccessTokenContext.Provider>
  );
}
