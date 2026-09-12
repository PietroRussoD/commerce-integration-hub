import { expect, test } from "vitest";

import { inspectAccessToken } from "./accessToken";

function createToken(payload: object): string {
  const header = { alg: "RS256", typ: "JWT" };
  return [header, payload, "signature"].map((segment) => btoa(JSON.stringify(segment)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")).join(".");
}

test("reads the subject, expiry and supported roles from an active access token", () => {
  const inspection = inspectAccessToken(
    createToken({ sub: "operator-42", exp: 1_800_000_000, groups: ["operator", "platform-admin", "ignored"] }),
    1_700_000_000_000,
  );

  expect(inspection).toMatchObject({
    kind: "active",
    identity: {
      subject: "operator-42",
      expiresAt: new Date("2027-01-15T08:00:00.000Z"),
    },
  });
  expect(inspection.kind === "active" && inspection.identity.roles).toEqual(new Set(["operator", "platform-admin"]));
});

test("reports a token with a passed expiry as expired", () => {
  expect(inspectAccessToken(createToken({ sub: "operator-42", exp: 1_700_000_000 }), 1_700_000_000_000)).toEqual({
    kind: "expired",
  });
});

test.each([
  "not-a-jwt",
  createToken({ exp: 1_800_000_000 }),
  createToken({ sub: "operator-42" }),
  createToken({ sub: "operator-42", exp: "tomorrow" }),
])("reports malformed or incomplete tokens as invalid", (token) => {
  expect(inspectAccessToken(token)).toEqual({ kind: "invalid" });
});
