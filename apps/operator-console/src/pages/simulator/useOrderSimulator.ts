import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";

import {
  receiveOrder,
  type ReceiveOrderParameters,
  type ReceiveOrderRequest,
  type ReceiveOrderResult,
} from "../../api/integrationCoreClient";

export interface SimulatorFormValues {
  sourceApiKey: string;
  externalId: string;
  currency: ReceiveOrderRequest["currency"];
  declaredTotalAmount: string;
  sku: string;
  quantity: string;
  unitPrice: string;
}

export interface OrderSimulator {
  form: SimulatorFormValues;
  updateField: <K extends keyof SimulatorFormValues>(field: K, value: SimulatorFormValues[K]) => void;
  submit: () => void;
  loadFreshOrder: () => void;
  loadReplay: () => void;
  loadConflict: () => void;
  loadInvalidOrder: () => void;
  canReplay: boolean;
  isPending: boolean;
  submittedRequest?: ReceiveOrderRequest;
  isDraftChanged: boolean;
  result?: ReceiveOrderResult;
  error: Error | null;
}

export function useOrderSimulator(): OrderSimulator {
  const [form, setForm] = useState<SimulatorFormValues>(createInitialForm);
  const [lastAcceptedRequest, setLastAcceptedRequest] = useState<ReceiveOrderRequest>();
  const submissionPending = useRef(false);
  const mutation = useMutation({
    mutationFn: (parameters: ReceiveOrderParameters) => receiveOrder(parameters),
    retry: false,
    onSuccess: (_result, parameters) => setLastAcceptedRequest(parameters.request),
    onSettled: () => { submissionPending.current = false; },
  });

  function updateField<K extends keyof SimulatorFormValues>(field: K, value: SimulatorFormValues[K]) {
    if (submissionPending.current) return;
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    // Lock before React renders the pending state, including repeated submits
    // or scenario handlers invoked in the same event turn.
    if (submissionPending.current) return;
    submissionPending.current = true;
    mutation.mutate({
      sourceApiKey: form.sourceApiKey,
      request: toRequest(form),
    });
  }

  function loadRequest(request: ReceiveOrderRequest) {
    if (submissionPending.current) return;
    const item = request.items[0];
    if (item === undefined) return;

    setForm((current) => ({
      ...current,
      externalId: request.externalId,
      currency: request.currency,
      declaredTotalAmount: request.declaredTotalAmount,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    }));
  }

  function loadFreshOrder() {
    loadRequest(createDemoRequest());
  }

  function loadReplay() {
    if (lastAcceptedRequest !== undefined) loadRequest(lastAcceptedRequest);
  }

  function loadConflict() {
    if (lastAcceptedRequest === undefined) return;

    loadRequest({
      externalId: lastAcceptedRequest.externalId,
      currency: lastAcceptedRequest.currency,
      declaredTotalAmount: "10.00",
      items: [{ sku: "CONFLICT-SKU", quantity: "1", unitPrice: "10.00" }],
    });
  }

  function loadInvalidOrder() {
    loadRequest({ ...createDemoRequest(), declaredTotalAmount: "39.97" });
  }

  return {
    form,
    updateField,
    submit,
    loadFreshOrder,
    loadReplay,
    loadConflict,
    loadInvalidOrder,
    canReplay: lastAcceptedRequest !== undefined,
    isPending: mutation.isPending,
    submittedRequest: mutation.variables?.request,
    isDraftChanged: mutation.variables !== undefined && (
      mutation.variables.sourceApiKey !== form.sourceApiKey ||
      !matchesSubmittedOrder(form, mutation.variables.request)
    ),
    result: mutation.data,
    error: mutation.error,
  };
}

function matchesSubmittedOrder(form: SimulatorFormValues, request: ReceiveOrderRequest): boolean {
  const item = request.items[0];
  return form.externalId === request.externalId &&
    form.currency === request.currency &&
    form.declaredTotalAmount === request.declaredTotalAmount &&
    form.sku === item?.sku && form.quantity === item?.quantity && form.unitPrice === item?.unitPrice;
}

function createInitialForm(): SimulatorFormValues {
  const request = createDemoRequest();
  const item = request.items[0];

  return {
    sourceApiKey: "",
    externalId: request.externalId,
    currency: request.currency,
    declaredTotalAmount: request.declaredTotalAmount,
    sku: item.sku,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  };
}

function toRequest(form: SimulatorFormValues): ReceiveOrderRequest {
  return {
    externalId: form.externalId,
    currency: form.currency,
    declaredTotalAmount: form.declaredTotalAmount,
    items: [{ sku: form.sku, quantity: form.quantity, unitPrice: form.unitPrice }],
  };
}

function createDemoRequest(): ReceiveOrderRequest & { items: [ReceiveOrderRequest["items"][number]] } {
  return {
    externalId: `DEMO-${crypto.randomUUID()}`,
    currency: "EUR",
    declaredTotalAmount: "39.98",
    items: [{ sku: "DEMO-SKU-001", quantity: "2", unitPrice: "19.99" }],
  };
}
