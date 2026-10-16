import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { AccessTokenProvider } from "./AccessTokenProvider";
import { useAccessToken } from "./accessTokenContext";

afterEach(cleanup);

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
