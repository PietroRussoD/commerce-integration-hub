import { CheckCircle2, CircleX, Copy, Eye, EyeOff, FilePlus2, Send, ShieldAlert, TriangleAlert } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

import { IntegrationCoreApiError, type ReceiveOrderResult } from "../../api/integrationCoreClient";
import { IconButton } from "../../components/ui/IconButton";
import { PageHeader } from "../../components/ui/PageHeader";
import { type SimulatorFormValues, useOrderSimulator } from "./useOrderSimulator";

const inputClassName =
  "h-10 w-full rounded-md border border-app-border-strong bg-app-surface px-3 text-sm text-app-foreground outline-none focus:border-app-brand-focus focus:ring-2 focus:ring-app-brand-focus-ring";
const amountPattern = "(?:0|[1-9][0-9]{0,16})(?:\\.[0-9]{1,2})?";
const quantityPattern = "(?:0|[1-9][0-9]{0,14})(?:\\.[0-9]{1,4})?";

export function SimulatorPage() {
  const { t } = useTranslation();
  const simulator = useOrderSimulator();
  const [isSourceApiKeyVisible, setIsSourceApiKeyVisible] = useState(false);
  const quantityError = findFieldError(simulator.error, "items[0].quantity");
  const unitPriceError = findFieldError(simulator.error, "items[0].unitPrice");

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
          <ScenarioButton icon={FilePlus2} label={t("simulator.scenarios.freshOrder")} onClick={simulator.loadFreshOrder} />
          <ScenarioButton
            icon={Copy}
            label={t("simulator.scenarios.equivalentReplay")}
            onClick={simulator.loadReplay}
            disabled={!simulator.canReplay}
          />
          <ScenarioButton
            icon={ShieldAlert}
            label={t("simulator.scenarios.conflict")}
            onClick={simulator.loadConflict}
            disabled={!simulator.canReplay}
          />
          <ScenarioButton icon={CircleX} label={t("simulator.scenarios.invalidTotal")} onClick={simulator.loadInvalidOrder} />
        </div>
      </div>

      <form onSubmit={handleSubmit} aria-busy={simulator.isPending} className="mt-5 space-y-7">
        <fieldset className="grid gap-4 border-0 p-0 sm:grid-cols-2">
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

        <fieldset className="grid gap-4 border-0 border-t border-app-border p-0 pt-6 sm:grid-cols-2 lg:grid-cols-3">
          <legend className="mb-3 text-lg font-semibold">{t("simulator.order.title")}</legend>
          <label className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            {t("simulator.order.externalId")}
            <input
              value={simulator.form.externalId}
              onChange={(event) => simulator.updateField("externalId", event.target.value)}
              maxLength={128}
              required
              className={inputClassName}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            {t("simulator.order.currency")}
            <select
              value={simulator.form.currency}
              onChange={(event) => simulator.updateField("currency", event.target.value as SimulatorFormValues["currency"])}
              className={inputClassName}
            >
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="USD">USD</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            {t("simulator.order.declaredTotal")}
            <input
              value={simulator.form.declaredTotalAmount}
              onChange={(event) => simulator.updateField("declaredTotalAmount", event.target.value)}
              inputMode="decimal"
              pattern={amountPattern}
              required
              className={inputClassName}
            />
          </label>
        </fieldset>

        <fieldset className="grid gap-4 border-0 border-t border-app-border p-0 pt-6 sm:grid-cols-3">
          <legend className="mb-3 text-lg font-semibold">{t("simulator.item.title")}</legend>
          <label className="grid gap-1.5 text-sm font-medium text-app-foreground-strong">
            {t("simulator.item.sku")}
            <input
              value={simulator.form.sku}
              onChange={(event) => simulator.updateField("sku", event.target.value)}
              maxLength={100}
              required
              className={inputClassName}
            />
          </label>
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
          <p role="status" className="sr-only">
            {t("simulator.actions.submitting")}
          </p>
        ) : null}
      </form>

      {simulator.result !== undefined ? <SimulationSuccess result={simulator.result} /> : null}
      {simulator.error !== null ? <SimulationError error={simulator.error} /> : null}
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

function SimulationSuccess({ result }: { result: ReceiveOrderResult }) {
  const { t } = useTranslation();
  const title = result.outcome === "CREATED" ? t("simulator.success.created") : t("simulator.success.replayed");

  return (
    <div role="status" className="mt-6 border-t border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-950">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-emerald-700" />
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 break-all font-mono text-xs text-emerald-800">{result.order.id}</p>
          <Link to={`/orders/${result.order.id}`} className="mt-3 inline-block text-sm font-semibold underline underline-offset-4">
            {t("simulator.actions.viewOrder")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SimulationError({ error }: { error: Error }) {
  const { t } = useTranslation();
  const fieldErrors = error instanceof IntegrationCoreApiError ? error.problem?.errors : undefined;

  return (
    <div role="alert" className="mt-6 border-t border-red-200 bg-red-50 px-4 py-4 text-red-950">
      <div className="flex items-start gap-3">
        <TriangleAlert aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-red-700" />
        <div>
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
        </div>
      </div>
    </div>
  );
}
