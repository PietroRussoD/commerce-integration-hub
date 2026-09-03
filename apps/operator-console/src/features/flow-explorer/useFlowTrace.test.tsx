import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import type { FlowTrace } from "./flowTrace";
import { loadFlowTrace } from "./loadFlowTrace";
import { useFlowTrace } from "./useFlowTrace";

vi.mock("./loadFlowTrace", () => ({ loadFlowTrace: vi.fn() }));

const loadFlowTraceMock = vi.mocked(loadFlowTrace);
const loadedTrace = { traceId: "erp-b-success-001" } as FlowTrace;

afterEach(() => {
  loadFlowTraceMock.mockReset();
});

test("loads the selected versioned artifact through React Query", async () => {
  loadFlowTraceMock.mockResolvedValue(loadedTrace);
  const queryClient = createQueryClient();
  const { result } = renderHook(() => useFlowTrace("erp-b-success"), {
    wrapper: createWrapper(queryClient),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(result.current.data).toBe(loadedTrace);
  expect(loadFlowTraceMock).toHaveBeenCalledWith({
    url: "/flow-traces/v1/erp-b-success.json",
    signal: expect.any(AbortSignal),
  });
  expect(queryClient.getQueryData(["flow-trace", "1.0", "erp-b-success"])).toBe(loadedTrace);
});

test("reuses an already loaded immutable artifact", async () => {
  loadFlowTraceMock.mockResolvedValue(loadedTrace);
  const queryClient = createQueryClient();
  const wrapper = createWrapper(queryClient);
  const firstRender = renderHook(() => useFlowTrace("erp-b-success"), { wrapper });

  await waitFor(() => expect(firstRender.result.current.isSuccess).toBe(true));
  firstRender.unmount();
  const secondRender = renderHook(() => useFlowTrace("erp-b-success"), { wrapper });
  await waitFor(() => expect(secondRender.result.current.isSuccess).toBe(true));

  expect(loadFlowTraceMock).toHaveBeenCalledTimes(1);
});

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function createWrapper(queryClient: QueryClient) {
  return function QueryWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}
