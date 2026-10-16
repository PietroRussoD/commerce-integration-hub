import { type ReactNode, useCallback, useMemo, useState } from "react";

import { AccessTokenDialogContext } from "./accessTokenDialogContext";

export function AccessTokenDialogProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ isOpen, open, close }), [isOpen, open, close]);
  return <AccessTokenDialogContext.Provider value={value}>{children}</AccessTokenDialogContext.Provider>;
}
