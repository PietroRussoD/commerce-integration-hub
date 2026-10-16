import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";

import { receiveOrder, type ReceiveOrderResult } from "../../api/integrationCoreClient";
import { useOrderSimulator } from "./useOrderSimulator";

vi.mock(import("../../api/integrationCoreClient"), async (importOriginal) => ({
  ...await importOriginal(), receiveOrder: vi.fn(),
}));

const receiveOrderMock = vi.mocked(receiveOrder);
const accepted: ReceiveOrderResult = {
  outcome: "CREATED",
  order: { id: "018f38c2-1b95-7cc4-bb89-72d26a6f9f88", sourceSystem: "MARKETPLACE_A", externalId: "SYNTHETIC-ORDER", currency: "EUR", totalAmount: "39.98", status: "RECEIVED", receivedAt: "2026-10-16T12:00:00Z", items: [] },
};

afterEach(() => { cleanup(); vi.resetAllMocks(); });

test("locks submission, fields and all scenarios synchronously until the POST settles", async () => {
  receiveOrderMock.mockResolvedValueOnce(accepted);
  const { result } = renderSimulator();
  act(() => result.current.updateField("sourceApiKey", "synthetic-key.secret"));
  act(() => result.current.submit());
  await waitFor(() => expect(result.current.canReplay).toBe(true));

  let resolve!: (value: ReceiveOrderResult) => void;
  receiveOrderMock.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  const submittedForm = { ...result.current.form };
  act(() => {
    result.current.submit();
    result.current.loadFreshOrder();
    result.current.loadReplay();
    result.current.loadConflict();
    result.current.loadInvalidOrder();
    result.current.updateField("externalId", "IGNORED-WHILE-PENDING");
    result.current.updateField("sourceApiKey", "other-key.secret");
    result.current.submit();
  });
  await waitFor(() => expect(receiveOrderMock).toHaveBeenCalledTimes(2));
  expect(result.current.form).toEqual(submittedForm);
  expect(result.current.isPending).toBe(true);
  expect(result.current.submittedRequest?.externalId).toBe(submittedForm.externalId);

  await act(async () => { resolve(accepted); });
  await waitFor(() => expect(result.current.isPending).toBe(false));
  act(() => result.current.loadFreshOrder());
  expect(result.current.form.externalId).not.toBe(submittedForm.externalId);
  expect(result.current.result).toEqual(accepted);
  expect(result.current.submittedRequest?.externalId).toBe(submittedForm.externalId);
  expect(result.current.isDraftChanged).toBe(true);
});

test("releases the lock after failure without automatic retries and keeps the failed request context", async () => {
  receiveOrderMock.mockRejectedValueOnce(new Error("Synthetic unavailable service"));
  const { result } = renderSimulator();
  act(() => result.current.updateField("sourceApiKey", "synthetic-key.secret"));
  const failedId = result.current.form.externalId;
  act(() => result.current.submit());
  await waitFor(() => expect(result.current.error?.message).toBe("Synthetic unavailable service"));
  expect(receiveOrderMock).toHaveBeenCalledTimes(1);
  act(() => result.current.loadInvalidOrder());
  expect(result.current.form.externalId).not.toBe(failedId);
  expect(result.current.submittedRequest?.externalId).toBe(failedId);
  expect(result.current.error?.message).toBe("Synthetic unavailable service");
  receiveOrderMock.mockResolvedValueOnce(accepted);
  act(() => result.current.submit());
  await waitFor(() => expect(result.current.result).toEqual(accepted));
  expect(receiveOrderMock).toHaveBeenCalledTimes(2);
  expect(result.current.isDraftChanged).toBe(false);
});

function renderSimulator() {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: 2, retryDelay: 0 } } });
  return renderHook(useOrderSimulator, { wrapper: ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ) });
}
