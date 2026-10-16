import { expect, test } from "vitest";

import { getDeliveryPayloadState, getReplayBlockingReasons, type ReplayDeliveryTarget } from "./deliveryReplayEligibility";

const now = Date.parse("2026-10-16T12:00:00Z");
const delivery: ReplayDeliveryTarget = {
  deliveryId: "delivery-42", status: "EXHAUSTED", connectorStatus: "ACTIVE", payloadRetained: true,
  payloadExpiresAt: "2026-10-17T12:00:00Z",
};

test("only an administrator with an exhausted delivery, active connector and usable payload can request a new attempt", () => {
  expect(getReplayBlockingReasons(delivery, true, getDeliveryPayloadState(delivery, now))).toEqual([]);
  expect(getReplayBlockingReasons(delivery, false, "available")).toEqual(["permission"]);
});

test.each(["RECEIVED", "FORWARDING", "RETRY_WAIT", "DELIVERED", "PERMANENT_FAILURE", "BLOCKED_CONFIGURATION"] as const)(
  "%s does not allow a new send attempt", (status) => {
    expect(getReplayBlockingReasons({ ...delivery, status }, true, "available")).toEqual(["state"]);
  },
);

test.each(["DISABLED", "BLOCKED_CONFIGURATION"] as const)("a %s connector blocks replay", (connectorStatus) => {
  expect(getReplayBlockingReasons({ ...delivery, connectorStatus }, true, "available")).toEqual(["connector"]);
});

test("distinguishes missing payload, expired retention and an unverifiable deadline", () => {
  const missing = { ...delivery, payloadRetained: false };
  const expired = { ...delivery, payloadExpiresAt: "2026-10-16T12:00:00Z" };
  const unknown = { ...delivery, payloadExpiresAt: "invalid" };
  expect(getReplayBlockingReasons(missing, true, getDeliveryPayloadState(missing, now))).toEqual(["payloadMissing"]);
  expect(getReplayBlockingReasons(expired, true, getDeliveryPayloadState(expired, now))).toEqual(["payloadExpired"]);
  expect(getReplayBlockingReasons(unknown, true, getDeliveryPayloadState(unknown, now))).toEqual(["payloadUnknown"]);
  expect(getDeliveryPayloadState(expired, now - 1)).toBe("available");
  expect(getDeliveryPayloadState(expired, now + 1)).toBe("expired");
});

test("reports simultaneous blockers rather than hiding later requirements", () => {
  expect(getReplayBlockingReasons({ ...delivery, status: "RECEIVED", connectorStatus: "DISABLED" }, false, "expired"))
    .toEqual(["permission", "state", "payloadExpired", "connector"]);
});
