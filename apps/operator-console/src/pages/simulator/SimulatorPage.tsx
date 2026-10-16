import { CheckCircle2, CircleX, Copy, Eye, EyeOff, FilePlus2, Send, ShieldAlert, TriangleAlert } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { IntegrationCoreApiError, type ReceiveOrderRequest, type ReceiveOrderResult } from "../../api/integrationCoreClient";
import { IconButton } from "../../components/ui/IconButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { type SimulatorFormValues, useOrderSimulator } from "./useOrderSimulator";

const inputClassName =
  "h-10 w-full rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring aria-invalid:border-red-600 aria-invalid:ring-1 aria-invalid:ring-red-200";
const amountPattern = "(?:0|[1-9][0-9]{0,16})(?:\\.[0-9]{1,2})?";
const quantityPattern = "(?:0|[1-9][0-9]{0,14})(?:\\.[0-9]{1,4})?";
const fieldElementIds: Record<string, string> = {
  externalId: "order-external-id",
  currency: "order-currency",
  declaredTotalAmount: "order-declared-total",
  "items[0].sku": "order-item-sku",
  "items[0].quantity": "order-item-quantity",
  "items[0].unitPrice": "order-item-unit-price",
};

export function SimulatorPage() {
  const { t } = useTranslation();
  const simulator = useOrderSimulator();
  const [isSourceApiKeyVisible, setIsSourceApiKeyVisible] = useState(false);
  const validationError = simulator.isDraftChanged ? null : simulator.error;
  const externalIdError = findFieldError(validationError, "externalId");
  const currencyError = findFieldError(validationError, "currency");
  const declaredTotalError = findFieldError(validationError, "declaredTotalAmount");
  const skuError = findFieldError(validationError, "items[0].sku");
  const quantityError = findFieldError(validationError, "items[0].quantity");
  const unitPriceError = findFieldError(validationError, "items[0].unitPrice");

  useEffect(() => {
    if (!(validationError instanceof IntegrationCoreApiError)) return;

    const fieldErrors = validationError.problem?.errors;
    const firstInvalidFieldId = Object.entries(fieldElementIds).find(([field]) =>
      fieldErrors?.some((error) => error.field === field),
    )?.[1];
    if (firstInvalidFieldId !== undefined) document.getElementById(firstInvalidFieldId)?.focus();
  }, [validationError]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    simulator.submit();
  }

  return (
    <section aria-labelledby="simulator-heading">
      <PageHeader titleId="simulator-heading" title={t("simulator.title")} />

      <div className="mt-5 border-b border-app-border pb-5">
        <h2 className="text-sm font-semibold text-app-foreground-strong">{t("simulator.scenarios.title")}</h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("simulator.scenarios.ariaLabel")}>
          <ScenarioButton icon={FilePlus2} label={t("simulator.scenarios.freshOrder")} onClick={simulator.loadFreshOrder} disabled={simulator.isPending} />
          <ScenarioButton
            icon={Copy}
            label={t("simulator.scenarios.equivalentReplay")}
            onClick={simulator.loadReplay}
            disabled={simulator.isPending || !simulator.canReplay}
          />
          <ScenarioButton
            icon={ShieldAlert}
            label={t("simulator.scenarios.conflict")}
            onClick={simulator.loadConflict}
            disabled={simulator.isPending || !simulator.canReplay}
          />
          <ScenarioButton icon={CircleX} label={t("simulator.scenarios.invalidTotal")} onClick={simulator.loadInvalidOrder} disabled={simulator.isPending} />
        </div>
      </div>

      <form onSubmit={handleSubmit} aria-busy={simulator.isPending} className="mt-5 space-y-7">
        <fieldset disabled={simulator.isPending} className="grid gap-4 border-0 p-0 sm:grid-cols-2">
          <legend className="mb-3 text-lg font-semibold">{t("simulator.authentication.title")}</legend>
          <div className="grid gap-1.5 text-sm font-medium text-app-foreground-strong sm:col-span-2">
            <label htmlFor="source-api-key">{t("simulator.authentication.apiKey")}</label>
            <div className="relative">
              <input
                id="source-api-key"
                type={isSourceApiKeyVisible ? "text" : "password"}
                value={simulator.form.sourceApiKey}
                onChange={(event) => simulator.updateField("sourceApiKey", event.target.value)}
                autoComplete="off"
                required
                className={`${inputClassName} pr-11`}
              />
              <IconButton
                label={
                  isSourceApiKeyVisible
                    ? t("simulator.authentication.hideApiKey")
                    : t("simulator.authentication.showApiKey")
                }
                variant="ghost"
                size="md"
                onClick={() => setIsSourceApiKeyVisible((isVisible) => !isVisible)}
                aria-pressed={isSourceApiKeyVisible}
                className="absolute right-0 top-0"
              >
                {isSourceApiKeyVisible ? <EyeOff aria-hidden="true" size={17} /> : <Eye aria-hidden="true" size={17} />}
              </IconButton>
            </div>
          </div>
        </fieldset>

        <fieldset disabled={simulator.isPending} className="grid gap-4 border-0 border-t border-app-border p-0 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="mb-3 text-lg font-semibold">{t("simulator.order.title")}</legend>
          <div className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            <label htmlFor="order-external-id">{t("simulator.order.externalId")}</label>
            <input
              id="order-external-id"
              value={simulator.form.externalId}
              onChange={(event) => simulator.updateField("externalId", event.target.value)}
              maxLength={128}
              required
              aria-invalid={externalIdError !== undefined}
              aria-describedby={externalIdError !== undefined ? "order-external-id-error" : undefined}
              className={inputClassName}
            />
            <FieldError id="order-external-id-error" error={externalIdError} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            <label htmlFor="order-currency">{t("simulator.order.currency")}</label>
            <select
              id="order-currency"
              value={simulator.form.currency}
              onChange={(event) => simulator.updateField("currency", event.target.value as SimulatorFormValues["currency"])}
              aria-invalid={currencyError !== undefined}
              aria-describedby={currencyError !== undefined ? "order-currency-error" : undefined}
              className={inputClassName}
            >
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
            </select>
            <FieldError id="order-currency-error" error={currencyError} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            <label htmlFor="order-declared-total">{t("simulator.order.declaredTotal")}</label>
            <input
              id="order-declared-total"
              value={simulator.form.declaredTotalAmount}
              onChange={(event) => simulator.updateField("declaredTotalAmount", event.target.value)}
              inputMode="decimal"
              pattern={amountPattern}
              required
              aria-invalid={declaredTotalError !== undefined}
              aria-describedby={declaredTotalError !== undefined ? "order-declared-total-error" : undefined}
              className={inputClassName}
            />
            <FieldError id="order-declared-total-error" error={declaredTotalError} />
          </div>
        </fieldset>

        <fieldset disabled={simulator.isPending} className="grid gap-4 border-0 border-t border-app-border p-0 pt-6 sm:grid-cols-3">
          <legend className="mb-3 text-lg font-semibold">{t("simulator.item.title")}</legend>
          <div className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            <label htmlFor="order-item-sku">{t("simulator.item.sku")}</label>
            <input
              id="order-item-sku"
              value={simulator.form.sku}
              onChange={(event) => simulator.updateField("sku", event.target.value)}
              maxLength={100}
              required
              aria-invalid={skuError !== undefined}
              aria-describedby={skuError !== undefined ? "order-item-sku-error" : undefined}
              className={inputClassName}
            />
            <FieldError id="order-item-sku-error" error={skuError} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            <label htmlFor="order-item-quantity">{t("simulator.item.quantity")}</label>
            <input
              id="order-item-quantity"
              value={simulator.form.quantity}
              onChange={(event) => simulator.updateField("quantity", event.target.value)}
              inputMode="decimal"
              pattern={quantityPattern}
              required
              aria-invalid={quantityError !== undefined}
              aria-describedby={quantityError !== undefined ? "order-item-quantity-error" : undefined}
              className={inputClassName}
            />
            <FieldError id="order-item-quantity-error" error={quantityError} />
          </div>
          <div className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            <label htmlFor="order-item-unit-price">{t("simulator.item.unitPrice")}</label>
            <input
              id="order-item-unit-price"
              value={simulator.form.unitPrice}
              onChange={(event) => simulator.updateField("unitPrice", event.target.value)}
              inputMode="decimal"
              pattern={quantityPattern}
              required
              aria-invalid={unitPriceError !== undefined}
              aria-describedby={unitPriceError !== undefined ? "order-item-unit-price-error" : undefined}
              className={inputClassName}
            />
            <FieldError id="order-item-unit-price-error" error={unitPriceError} />
          </div>
        </fieldset>

        <div className="flex justify-end border-t border-app-border pt-5">
          <button
            type="submit"
            disabled={simulator.isPending}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-app-brand-primary px-4 text-sm font-semibold text-app-brand-foreground hover:bg-app-brand-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send aria-hidden="true" size={17} />
            {simulator.isPending ? t("simulator.actions.submitting") : t("simulator.actions.submit")}
          </button>
        </div>
        {simulator.isPending ? (
          <p role="status" className="text-sm text-app-foreground-secondary">
            {t("simulator.submission.pending")}
          </p>
        ) : null}
      </form>

      {simulator.result !== undefined && simulator.submittedRequest !== undefined ? (
        <SimulationSuccess result={simulator.result} request={simulator.submittedRequest} isDraftChanged={simulator.isDraftChanged} />
      ) : null}
      {simulator.error !== null && simulator.submittedRequest !== undefined ? (
        <SimulationError error={simulator.error} request={simulator.submittedRequest} isDraftChanged={simulator.isDraftChanged} />
      ) : null}
    </section>
  );
}

function findFieldError(error: Error | null, field: string) {
  if (!(error instanceof IntegrationCoreApiError)) return undefined;

  return error.problem?.errors?.find((fieldError) => fieldError.field === field);
}

function FieldError({ id, error }: { id: string; error: { message: string } | undefined }) {
  if (error === undefined) return null;

  return (
    <span id={id} className="text-xs font-normal text-red-700">
      {error.message}
    </span>
  );
}

function ScenarioButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: typeof FilePlus2;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-app-border-strong bg-app-surface px-3 text-sm font-medium text-app-foreground-strong hover:bg-app-canvas hover:text-app-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-app-brand-focus disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon aria-hidden="true" size={16} />
      {label}
    </button>
  );
}

function SubmissionContext({ request, isDraftChanged }: { request: ReceiveOrderRequest; isDraftChanged: boolean }) {
  const { t } = useTranslation();
  const item = request.items[0];
  return (
    <div className="mt-4 text-sm">
      {isDraftChanged ? <p className="mb-3 font-semibold">{t("simulator.submission.draftChanged")}</p> : null}
      <h2 className="font-semibold">{t("simulator.submission.title")}</h2>
      <dl className="mt-2 grid gap-2 sm:grid-cols-2">
        <div><dt>{t("simulator.order.externalId")}</dt><dd className="break-all font-mono">{request.externalId}</dd></div>
        <div><dt>{t("simulator.order.currency")}</dt><dd>{request.currency}</dd></div>
        <div><dt>{t("simulator.order.declaredTotal")}</dt><dd>{request.declaredTotalAmount}</dd></div>
        <div><dt>{t("simulator.item.sku")}</dt><dd className="break-all font-mono">{item?.sku}</dd></div>
        <div><dt>{t("simulator.item.quantity")}</dt><dd>{item?.quantity}</dd></div>
        <div><dt>{t("simulator.item.unitPrice")}</dt><dd>{item?.unitPrice}</dd></div>
      </dl>
    </div>
  );
}

function SimulationSuccess({ result, request, isDraftChanged }: { result: ReceiveOrderResult; request: ReceiveOrderRequest; isDraftChanged: boolean }) {
  const { t } = useTranslation();
  const title = result.outcome === "CREATED" ? t("simulator.success.created") : t("simulator.success.replayed");

  return (
    <div role="status" className="mt-6 border-t border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-950">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 break-all font-mono text-xs text-emerald-800">{result.order.id}</p>
          <SubmissionContext request={request} isDraftChanged={isDraftChanged} />
          <Link to={`/orders/${result.order.id}`} className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">
            {t("simulator.actions.viewOrder")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SimulationError({ error, request, isDraftChanged }: { error: Error; request: ReceiveOrderRequest; isDraftChanged: boolean }) {
  const { t } = useTranslation();
  const fieldErrors = error instanceof IntegrationCoreApiError ? error.problem?.errors : undefined;

  return (
    <div role="alert" className="mt-6 border-t border-red-200 bg-red-50 px-4 py-4 text-red-950">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-red-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("simulator.error.title")}</p>
          <p className="mt-1 text-sm">{error.message}</p>
          {fieldErrors !== undefined && fieldErrors.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {fieldErrors.map((fieldError) => (
                <li key={`${fieldError.field}-${fieldError.message}`}>
                  <span className="font-mono text-xs">{fieldError.field}</span>: {fieldError.message}
                </li>
              ))}
            </ul>
          ) : null}
          <SubmissionContext request={request} isDraftChanged={isDraftChanged} />
        </div>
      </div>
    </div>
  );
}
