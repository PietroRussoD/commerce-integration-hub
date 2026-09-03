import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("tracks the reduced-motion media query", () => {
  let matches = false;
  let listener: (() => void) | undefined;
  const mediaQuery = {
    addEventListener: vi.fn((_event: string, onChange: () => void) => {
      listener = onChange;
    }),
    get matches() {
      return matches;
    },
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => mediaQuery));
  const { result } = renderHook(() => usePrefersReducedMotion());

  expect(result.current).toBe(false);

  act(() => {
    matches = true;
    listener?.();
  });

  expect(result.current).toBe(true);
});
