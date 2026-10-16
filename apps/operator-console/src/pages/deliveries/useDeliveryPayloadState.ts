import { useCallback, useSyncExternalStore } from "react";

import { getDeliveryPayloadState, type ReplayDeliveryTarget } from "./deliveryReplayEligibility";

// The clock is an external input. Read it from store snapshots and confirmation
// handlers; keep the eligibility calculation independently testable with a time.
export function readDeliveryPayloadState(delivery: Pick<ReplayDeliveryTarget, "payloadRetained" | "payloadExpiresAt">) {
  return getDeliveryPayloadState(delivery, Date.now());
}

export function useDeliveryPayloadState({ payloadRetained, payloadExpiresAt }: Pick<ReplayDeliveryTarget, "payloadRetained" | "payloadExpiresAt">) {
  const getSnapshot = useCallback(
    () => readDeliveryPayloadState({ payloadRetained, payloadExpiresAt }),
    [payloadRetained, payloadExpiresAt],
  );
  const subscribe = useCallback((onChange: () => void) => {
    let timer: number | undefined;
    const check = () => {
      window.clearTimeout(timer);
      onChange();
      const remaining = Date.parse(payloadExpiresAt) - Date.now();
      if (payloadRetained && Number.isFinite(remaining) && remaining > 0) {
        // Long retention windows must not overflow the browser's signed timer delay.
        timer = window.setTimeout(check, Math.min(remaining, 2_147_483_647));
      }
    };
    check();
    // Background timer throttling and clock changes must not leave an expired
    // payload presented as usable when the operator returns to the console.
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [payloadRetained, payloadExpiresAt]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
