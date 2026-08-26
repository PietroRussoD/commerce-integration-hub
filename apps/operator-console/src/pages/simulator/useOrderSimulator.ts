import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

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
  result?: ReceiveOrderResult;
  error: Error | null;
}

export function useOrderSimulator(): OrderSimulator {
  const [form, setForm] = useState<SimulatorFormValues>(createInitialForm);
  const [lastAcceptedRequest, setLastAcceptedRequest] = useState<ReceiveOrderRequest>();
  const mutation = useMutation({
    mutationFn: (parameters: ReceiveOrderParameters) => receiveOrder(parameters),
    onSuccess: (_result, parameters) => setLastAcceptedRequest(parameters.request),
  });

  function updateField<K extends keyof SimulatorFormValues>(field: K, value: SimulatorFormValues[K]) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function submit() {
    mutation.mutate({
      sourceApiKey: form.sourceApiKey,
      request: toRequest(form),
    });
  }

  function loadRequest(request: ReceiveOrderRequest) {
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
    mutation.reset();
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
    result: mutation.data,
    error: mutation.error,
  };
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
