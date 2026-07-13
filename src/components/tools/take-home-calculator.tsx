"use client";

import type { FormEvent } from "react";

import { trackEvent } from "@/lib/analytics/events";
import { formatSalaryAmount } from "@/lib/format";

import {
  isToolResponseRecord,
  toolResponseError,
  useToolRequest,
} from "./use-tool-request";

type PayeResult = {
  grossAnnual: number;
  grossMonthly: number;
  netAnnual: number;
  netMonthly: number;
  incomeTaxAnnual: number;
  taxableIncomeAnnual: number;
  deductionsAnnual: number;
  effectiveRate: string | null;
  evidence: {
    provider: string;
    apiVersion: string;
    rulesVersion: string;
    rulesYear: string;
    source: string;
    taxAuthority: string;
    lastVerifiedAt: string;
    dataPolicy: string;
    docsUrl: string;
    sandbox: boolean;
  };
};

function money(value: number) {
  return formatSalaryAmount(value, "NGN");
}

export function TakeHomeCalculator() {
  const { result, error, loading, run } = useToolRequest<PayeResult>(
    "Calculation failed.",
  );

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    trackEvent("tool_started", { tool_id: "ng_paye" });
    const completed = await run({
      endpoint: "/api/tools/take-home-pay",
      createPayload: () => {
        const form = new FormData(event.currentTarget);
        return {
          consent: true,
          input: {
            country: "NG",
            mode: form.get("mode"),
            period: form.get("period"),
            amount: Number(form.get("amount")),
          },
        };
      },
      parseResponse: (response, body) => {
        const parsedResult = isToolResponseRecord(body)
          ? body.result
          : undefined;
        if (!response.ok || !isToolResponseRecord(parsedResult)) {
          throw new Error(
            toolResponseError(body, "No verified PAYE result is available."),
          );
        }
        return parsedResult as unknown as PayeResult;
      },
    });
    if (completed) {
      trackEvent("tool_completed", { tool_id: "ng_paye" });
    }
  }

  return (
    <div className="tool-workspace">
      <form className="contribution-form" onSubmit={calculate}>
        <fieldset>
          <legend>Calculation</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="mode">Direction</label>
              <select className="select" id="mode" name="mode">
                <option value="gross_to_net">Gross to net</option>
                <option value="net_to_gross">Net to gross</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="amount">Salary amount</label>
              <input
                className="input"
                id="amount"
                name="amount"
                type="number"
                min="1"
                max="1000000000000"
                step="1"
                defaultValue="500000"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="period">Period</label>
              <select className="select" id="period" name="period">
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
          </div>
        </fieldset>
        <label className="checkbox provider-consent">
          <input type="checkbox" required />
          Send this amount to the AfroTools PAYE API for this calculation.
          SalaryPadi does not store it.
        </label>
        <button className="button w-fit" type="submit" disabled={loading}>
          {loading ? "Calculating…" : "Calculate"}
        </button>
      </form>
      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}
      {result ? (
        <section className="surface surface-pad stack" aria-live="polite">
          <h2 className="section-title">Verified estimate</h2>
          <dl className="data-list">
            <div>
              <dt>Gross monthly</dt>
              <dd>{money(result.grossMonthly)}</dd>
            </div>
            <div>
              <dt>Net monthly</dt>
              <dd>{money(result.netMonthly)}</dd>
            </div>
            <div>
              <dt>Annual PAYE</dt>
              <dd>{money(result.incomeTaxAnnual)}</dd>
            </div>
            <div>
              <dt>Annual deductions</dt>
              <dd>{money(result.deductionsAnnual)}</dd>
            </div>
          </dl>
          <div
            className={
              result.evidence.sandbox ? "notice notice-warning" : "notice"
            }
          >
            <strong>
              {result.evidence.provider} {result.evidence.rulesVersion}
            </strong>
            <p>
              Rules year {result.evidence.rulesYear}. Source:{" "}
              {result.evidence.source}. Last verified{" "}
              {new Date(result.evidence.lastVerifiedAt).toLocaleString()}.
            </p>
            <a href={result.evidence.docsUrl}>API provenance</a>
            {result.evidence.sandbox ? (
              <p>
                Sandbox data: do not treat this result as production tax advice.
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
