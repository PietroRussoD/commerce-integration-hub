import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { AccessTokenProvider } from "./AccessTokenProvider";
import { useAccessToken } from "./accessTokenContext";

afterEach(() => { cleanup(); vi.useRealTimers(); });

test("isolates renewed tokens for the same subject and fresh anonymous access", () => {
  const { result } = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  const anonymousScope = result.current.cacheScope;
  const firstToken = token("first");
  act(() => { result.current.setAccessToken(` ${firstToken} `); });
  const firstScope = result.current.cacheScope;
  expect(firstScope).not.toBe(anonymousScope);
  expect(result.current.accessToken).toBe(firstToken);
  act(() => { result.current.setAccessToken(firstToken); });
  expect(result.current.cacheScope).toBe(firstScope);
  act(() => { result.current.setAccessToken(token("renewed")); });
  expect(result.current.cacheScope).not.toBe(firstScope);
  const renewedScope = result.current.cacheScope;
  act(() => { result.current.clearAccessToken(); });
  expect(result.current.accessToken).toBeUndefined();
  expect(result.current.identity).toBeUndefined();
  expect(result.current.cacheScope).not.toBe(renewedScope);
  expect(result.current.cacheScope).not.toBe(anonymousScope);
  const clearedScope = result.current.cacheScope;
  act(() => { result.current.clearAccessToken(); });
  expect(result.current.cacheScope).toBe(clearedScope);
});

test("invalid input clears credentials and their scope without changing an already anonymous scope", () => {
  const { result } = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  const anonymousScope = result.current.cacheScope;
  act(() => { result.current.setAccessToken("invalid"); });
  expect(result.current.cacheScope).toBe(anonymousScope);
  act(() => { result.current.setAccessToken(token("first")); });
  const authenticatedScope = result.current.cacheScope;
  act(() => { result.current.setAccessToken("invalid"); });
  expect(result.current.accessToken).toBeUndefined();
  expect(result.current.cacheScope).not.toBe(authenticatedScope);
});

test("a remounted provider cannot reuse a previous provider's cache scope", () => {
  const first = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  const firstScope = first.result.current.cacheScope;
  first.unmount();
  const second = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  expect(second.result.current.cacheScope).not.toBe(firstScope);
});

function token(id: string): string {
  return `${btoa(JSON.stringify({ alg: "RS256" }))}.${btoa(JSON.stringify({ sub: "synthetic-operator", exp: 1_900_000_000, jti: id }))}.signature`;
}

function expiringToken(expiresAt: number, id = "expiring") {
  return `${btoa("{}")}.${btoa(JSON.stringify({ sub: "synthetic-operator", exp: expiresAt / 1_000, jti: id }))}.signature`;
}

test("expires at the exact boundary into a fresh anonymous scope", () => {
  vi.useFakeTimers();
  const { result } = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  const originalAnonymousScope = result.current.cacheScope;
  act(() => { result.current.setAccessToken(expiringToken(Date.now() + 1_000)); });
  const authenticatedScope = result.current.cacheScope;
  act(() => { vi.advanceTimersByTime(999); });
  expect(result.current.accessToken).toBeDefined();
  act(() => { vi.advanceTimersByTime(1); });
  expect(result.current.accessToken).toBeUndefined();
  expect(result.current.identity).toBeUndefined();
  expect(result.current.hasExpired).toBe(true);
  expect(result.current.cacheScope).not.toBe(authenticatedScope);
  expect(result.current.cacheScope).not.toBe(originalAnonymousScope);
});

test("renewal cancels the old expiry and clears the expiry notice", () => {
  vi.useFakeTimers();
  const { result } = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  act(() => { result.current.setAccessToken(expiringToken(Date.now() + 1_000)); });
  const renewed = expiringToken(Date.now() + 10_000, "renewed");
  act(() => { result.current.setAccessToken(renewed); });
  const renewedScope = result.current.cacheScope;
  act(() => { vi.advanceTimersByTime(1_000); });
  expect(result.current.accessToken).toBe(renewed);
  expect(result.current.cacheScope).toBe(renewedScope);
  act(() => { vi.advanceTimersByTime(9_000); });
  expect(result.current.hasExpired).toBe(true);
  act(() => { result.current.setAccessToken(expiringToken(Date.now() + 1_000)); });
  expect(result.current.hasExpired).toBe(false);
});

test.each(["focus", "visibilitychange"])("rechecks expiry after delayed timers on %s", (event) => {
  vi.useFakeTimers();
  const { result } = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  act(() => { result.current.setAccessToken(expiringToken(Date.now() + 1_000)); });
  vi.setSystemTime(Date.now() + 2_000);
  fireEvent(event === "focus" ? window : document, new Event(event));
  expect(result.current.hasExpired).toBe(true);
  expect(result.current.accessToken).toBeUndefined();
});

test("does not overflow the browser timeout for long-lived tokens", () => {
  vi.useFakeTimers();
  const { result } = renderHook(useAccessToken, { wrapper: AccessTokenProvider });
  const duration = 2_147_483_647 + 1_000;
  act(() => { result.current.setAccessToken(expiringToken(Date.now() + duration)); });
  act(() => { vi.advanceTimersByTime(2_147_483_647); });
  expect(result.current.accessToken).toBeDefined();
  act(() => { vi.advanceTimersByTime(1_000); });
  expect(result.current.hasExpired).toBe(true);
});
