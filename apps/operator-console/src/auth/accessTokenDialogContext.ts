import { createContext, useContext } from "react";

export const AccessTokenDialogContext = createContext<{ isOpen: boolean; open: () => void; close: () => void } | undefined>(undefined);

export function useAccessTokenDialog() {
  const value = useContext(AccessTokenDialogContext);
  if (value === undefined) throw new Error("useAccessTokenDialog must be used within AccessTokenDialogProvider");
  return value;
}
