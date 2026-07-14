"use client";

import type { FormEvent } from "react";

import { trackEvent } from "@/lib/analytics/events";
import { CompanyEvidenceInvitation } from "@/components/companies/company-evidence-invitation";
import { formatSalaryAmount } from "@/lib/format";

import {
  isToolResponseRecord,
  toolResponseError,
  useToolRequest,
} from "./use-tool-request";

type AfroToolsFxEvidence = {
  from: string;
  to: string;
  rate: number;
  source: string;
  updatedAt: string;
  freshness: "fresh" | "stale";
  sandbox: boolean;
  dataPolicy: string;
};

type Conversion = {
  amount: number;
  convertedAmount: number;
  from: string;
  to: string;
  period: "monthly" | "annual";
  evidence: AfroToolsFxEvidence;
};

export function SalaryConverter() {
  const { result, error, loading, run } =
    useToolRequest<Conversion>("Conversion failed.");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trackEvent("tool_started", { tool_id: "salary_converter" });
    const completed = await run({
      endpoint: "/api/tools/salary-convert",
      createPayload: () => {
        const form = new FormData(event.currentTarget);
        return {
          input: {
            amount: Number(form.get("amount")),
            from: String(form.get("from")).toUpperCase(),
            to: String(form.get("to")).toUpperCase(),
            period: form.get("period"),
          },
        };
      },
      parseResponse: (response, body) => {
        const parsedResult = isToolResponseRecord(body)
          ? body.result
          : undefined;
        if (!response.ok || !isToolResponseRecord(parsedResult)) {
          throw new Error(
            toolResponseError(body, "No verified conversion is available."),
          );
        }
        return parsedResult as unknown as Conversion;
      },
    });
    if (completed) {
      trackEvent("tool_completed", { tool_id: "salary_converter" });
    }
  }
  return (
    <div className="tool-workspace">
      <form className="contribution-form" onSubmit={submit}>
        <fieldset>
          <legend>Salary and currency</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="salary_amount">Salary amount</label>
              <input
                className="input"
                id="salary_amount"
                name="amount"
                type="number"
                min="1"
                max="1000000000000"
                defaultValue="1000"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="from_currency">From</label>
              <input
                className="input"
                id="from_currency"
                name="from"
                defaultValue="USD"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="to_currency">To</label>
              <input
                className="input"
                id="to_currency"
                name="to"
                defaultValue="NGN"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="salary_period">Period</label>
              <select className="select" id="salary_period" name="period">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
        </fieldset>
        <p className="field-help">
          Only the currency pair is sent to AfroTools. SalaryPadi applies the
          returned unit rate locally; your salary amount is not sent to
          AfroTools.
        </p>
        <button className="button w-fit" disabled={loading}>
          {loading ? "Converting…" : "Convert salary"}
        </button>
      </form>
      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}
      {result ? (
        <section className="surface surface-pad stack" aria-live="polite">
          <h2 className="section-title">Converted salary</h2>
          <p className="hero-number">
            {formatSalaryAmount(result.convertedAmount, result.to)}{" "}
            {result.period}
          </p>
          <div
            className={
              result.evidence.freshness === "stale"
                ? "notice notice-warning"
                : "notice"
            }
          >
            <strong>{result.evidence.source}</strong>
            <p>
              1 {result.from} = {result.evidence.rate} {result.to}. Updated{" "}
              {new Date(result.evidence.updatedAt).toLocaleString()}.
            </p>
            {result.evidence.freshness === "stale" ? (
              <p>
                This rate is older than 36 hours. Confirm an executable rate
                before making a decision.
              </p>
            ) : null}
          </div>
          <CompanyEvidenceInvitation kind="calculator" />
        </section>
      ) : null}
    </div>
  );
}
