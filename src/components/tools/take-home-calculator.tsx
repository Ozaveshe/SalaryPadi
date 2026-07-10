"use client";

import { useState, type FormEvent } from "react";

import { formatSalaryAmount } from "@/lib/format";
import {
  type NigeriaPayrollInput,
  type NigeriaPayrollResult,
  type PayrollPeriod,
  type PeriodicAmount,
} from "@/lib/payroll";

function numberValue(form: FormData, name: string, fallback = 0) {
  const raw = String(form.get(name) ?? "").trim();
  if (raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0)
    throw new Error(
      `${name.replaceAll("_", " ")} must be a non-negative number.`,
    );
  return value;
}

function periodic(amount: number, period: PayrollPeriod): PeriodicAmount {
  return { amount, period };
}

function money(value: number) {
  return formatSalaryAmount(value, "NGN");
}

export function TakeHomeCalculator({ defaultDate }: { defaultDate: string }) {
  const [result, setResult] = useState<NigeriaPayrollResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [providerNotice, setProviderNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pensionMode, setPensionMode] =
    useState<NigeriaPayrollInput["pension"]["mode"]>("not_applicable");
  const [nhfParticipates, setNhfParticipates] = useState(false);

  function shareCalculator() {
    const url = window.location.href.split("#")[0];
    const shareData = {
      title: "SalaryPadi Nigeria take-home pay calculator",
      text: "Estimate Nigeria PAYE and take-home pay with explicit assumptions.",
      url,
    };

    if (navigator.share) {
      void navigator.share(shareData).catch(() => undefined);
      return;
    }

    const message = encodeURIComponent(`${shareData.text} ${url}`);
    window.open(
      `https://wa.me/?text=${message}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setProviderNotice(null);
    setLoading(true);
    try {
      const form = new FormData(event.currentTarget);
      const period = String(form.get("period")) as PayrollPeriod;
      const pensionMode = String(
        form.get("pension_mode"),
      ) as NigeriaPayrollInput["pension"]["mode"];
      const pensionable = numberValue(form, "pensionable_emoluments");
      const actualPension = numberValue(form, "actual_pension");
      let pension: NigeriaPayrollInput["pension"];
      if (pensionMode === "statutory")
        pension = {
          mode: "statutory",
          pensionableEmoluments: periodic(pensionable, period),
        };
      else if (pensionMode === "actual")
        pension = {
          mode: "actual",
          pensionableEmoluments: periodic(pensionable, period),
          employeeContribution: periodic(actualPension, period),
        };
      else if (pensionMode === "employer_covers_all")
        pension = { mode: "employer_covers_all" };
      else pension = { mode: "not_applicable" };

      const nhfParticipates = form.get("nhf_participates") === "on";
      const nhfBase = numberValue(form, "nhf_base");
      const actualNhfRaw = String(form.get("actual_nhf") ?? "").trim();
      const input: NigeriaPayrollInput = {
        calculationDate: String(form.get("calculation_date")),
        grossCashPay: periodic(numberValue(form, "gross_cash_pay"), period),
        pension,
        nhf: {
          sector:
            String(form.get("sector")) === "public" ? "public" : "private",
          participationOverride: nhfParticipates,
          ...(nhfParticipates && nhfBase > 0
            ? { contributionBase: periodic(nhfBase, period) }
            : {}),
          ...(nhfParticipates && actualNhfRaw !== ""
            ? {
                actualEmployeeContribution: periodic(
                  numberValue(form, "actual_nhf"),
                  period,
                ),
              }
            : {}),
        },
        healthInsuranceContribution: periodic(
          numberValue(form, "health_contribution"),
          period,
        ),
        taxExemptEmploymentIncome: periodic(
          numberValue(form, "tax_exempt_income"),
          period,
        ),
        taxableBenefitsInKind: periodic(
          numberValue(form, "taxable_benefits"),
          period,
        ),
        eligibleTaxDeductions: {
          rentPaid: periodic(numberValue(form, "rent_paid"), period),
          ownerOccupiedMortgageInterest: periodic(
            numberValue(form, "mortgage_interest"),
            period,
          ),
          lifeInsuranceOrDeferredAnnuity: periodic(
            numberValue(form, "life_insurance"),
            period,
          ),
        },
        otherDeductions:
          numberValue(form, "other_deductions") > 0
            ? [
                {
                  label: "Other authorised deductions",
                  amount: periodic(
                    numberValue(form, "other_deductions"),
                    period,
                  ),
                },
              ]
            : [],
      };
      const response = await fetch("/api/tools/take-home-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, input }),
      });
      const body = (await response.json()) as {
        result?: NigeriaPayrollResult;
        error?: string;
        notice?: string;
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error || "The payroll calculation could not run.");
      }
      setResult(body.result);
      setProviderNotice(body.notice ?? null);
    } catch (reason) {
      setResult(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Check the entered amounts and try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="tool-workspace">
      <form className="contribution-form" onSubmit={calculate}>
        <fieldset>
          <legend>Pay and date</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="gross_cash_pay">Gross cash pay</label>
              <input
                className="input"
                id="gross_cash_pay"
                name="gross_cash_pay"
                type="number"
                min="0"
                step="1"
                defaultValue="500000"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="period">Input period</label>
              <select
                className="select"
                id="period"
                name="period"
                defaultValue="monthly"
              >
                <option value="monthly">Monthly</option>
                <option value="annual">Annual</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="calculation_date">Calculation date</label>
              <input
                className="input"
                id="calculation_date"
                name="calculation_date"
                type="date"
                defaultValue={defaultDate}
                min="2026-01-01"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="tax_exempt_income">
                Tax-exempt employment amount
              </label>
              <input
                className="input"
                id="tax_exempt_income"
                name="tax_exempt_income"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
            </div>
            <div className="field">
              <label htmlFor="taxable_benefits">
                Taxable non-cash benefits
              </label>
              <input
                className="input"
                id="taxable_benefits"
                name="taxable_benefits"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
              <p className="field-help">
                Affects PAYE, but is not cash take-home.
              </p>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Pension</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pension_mode">Employee pension treatment</label>
              <select
                className="select"
                id="pension_mode"
                name="pension_mode"
                value={pensionMode}
                onChange={(event) =>
                  setPensionMode(
                    event.target
                      .value as NigeriaPayrollInput["pension"]["mode"],
                  )
                }
              >
                <option value="not_applicable">Not applicable / exclude</option>
                <option value="statutory">
                  Calculate 8% from explicit base
                </option>
                <option value="actual">Use actual contribution</option>
                <option value="employer_covers_all">Employer covers all</option>
              </select>
            </div>
            {pensionMode === "statutory" || pensionMode === "actual" ? (
              <div className="field">
                <label htmlFor="pensionable_emoluments">
                  Pensionable emoluments
                </label>
                <input
                  className="input"
                  id="pensionable_emoluments"
                  name="pensionable_emoluments"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="0"
                  required
                />
                <p className="field-help">
                  Use the contractual basic + housing + transport base—not gross
                  by assumption.
                </p>
              </div>
            ) : null}
            {pensionMode === "actual" ? (
              <div className="field">
                <label htmlFor="actual_pension">
                  Actual employee contribution
                </label>
                <input
                  className="input"
                  id="actual_pension"
                  name="actual_pension"
                  type="number"
                  min="0"
                  step="1"
                  defaultValue="0"
                  required
                />
              </div>
            ) : null}
          </div>
        </fieldset>
        <fieldset>
          <legend>NHF and health</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="sector">Employment sector</label>
              <select className="select" id="sector" name="sector">
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                name="nhf_participates"
                checked={nhfParticipates}
                onChange={(event) => setNhfParticipates(event.target.checked)}
              />
              Include NHF participation
            </label>
            {nhfParticipates ? (
              <>
                <div className="field">
                  <label htmlFor="nhf_base">NHF contribution base</label>
                  <input
                    className="input"
                    id="nhf_base"
                    name="nhf_base"
                    type="number"
                    min="0"
                    step="1"
                    defaultValue="0"
                  />
                </div>
                <div className="field">
                  <label htmlFor="actual_nhf">
                    Actual NHF contribution (optional)
                  </label>
                  <input
                    className="input"
                    id="actual_nhf"
                    name="actual_nhf"
                    type="number"
                    min="0"
                    step="1"
                  />
                </div>
              </>
            ) : null}
            <div className="field">
              <label htmlFor="health_contribution">
                Actual employee health contribution
              </label>
              <input
                className="input"
                id="health_contribution"
                name="health_contribution"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
              <p className="field-help">No national percentage is inferred.</p>
            </div>
          </div>
        </fieldset>
        <fieldset>
          <legend>Eligible tax claims and other deductions</legend>
          <p className="field-help">
            Amounts use the selected input period. Claims must be qualifying
            amounts actually paid and may need evidence.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="rent_paid">Rent actually paid</label>
              <input
                className="input"
                id="rent_paid"
                name="rent_paid"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
            </div>
            <div className="field">
              <label htmlFor="mortgage_interest">
                Owner-occupied mortgage interest
              </label>
              <input
                className="input"
                id="mortgage_interest"
                name="mortgage_interest"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
            </div>
            <div className="field">
              <label htmlFor="life_insurance">
                Life insurance or deferred annuity
              </label>
              <input
                className="input"
                id="life_insurance"
                name="life_insurance"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
            </div>
            <div className="field">
              <label htmlFor="other_deductions">
                Other authorised cash deductions
              </label>
              <input
                className="input"
                id="other_deductions"
                name="other_deductions"
                type="number"
                min="0"
                step="1"
                defaultValue="0"
              />
            </div>
          </div>
        </fieldset>
        <label className="checkbox provider-consent">
          <input type="checkbox" name="afrotools_consent" required />
          Send these pay and deduction amounts securely to the AfroTools PAYE
          API for this calculation. AfroTools processes them for this request
          and does not intentionally retain them.
        </label>
        <button className="button w-fit" type="submit" disabled={loading}>
          {loading ? "Calculating…" : "Calculate take-home pay"}
        </button>
      </form>
      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}
      {providerNotice ? (
        <div className="notice notice-warning" role="status">
          {providerNotice}
        </div>
      ) : null}
      {result ? (
        <section
          className="tool-result stack"
          aria-labelledby="take-home-result"
        >
          <div className="split">
            <div role="status" aria-live="polite">
              <p className="eyebrow">Estimated result</p>
              <h2 className="section-title" id="take-home-result">
                {money(result.monthly.takeHomePay)} per month
              </h2>
              <p className="text-muted m-0">
                {money(result.annual.takeHomePay)} estimated annual cash
                take-home
              </p>
            </div>
            <div className="cluster">
              <button
                className="button button-secondary print-hide"
                type="button"
                onClick={() => window.print()}
              >
                Print result
              </button>
              <button
                className="button button-quiet print-hide"
                type="button"
                onClick={shareCalculator}
              >
                Share calculator
              </button>
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Item</th>
                  <th scope="col">Monthly</th>
                  <th scope="col">Annual</th>
                </tr>
              </thead>
              <tbody>
                {[
                  [
                    "Gross cash pay",
                    result.monthly.grossCashPay,
                    result.annual.grossCashPay,
                  ],
                  [
                    "Employee pension",
                    result.monthly.employeePension,
                    result.annual.employeePension,
                  ],
                  [
                    "NHF",
                    result.monthly.nationalHousingFund,
                    result.annual.nationalHousingFund,
                  ],
                  [
                    "Health contribution",
                    result.monthly.healthInsurance,
                    result.annual.healthInsurance,
                  ],
                  ["PAYE", result.monthly.paye, result.annual.paye],
                  [
                    "Other deductions",
                    result.monthly.otherDeductions,
                    result.annual.otherDeductions,
                  ],
                  [
                    "Take-home pay",
                    result.monthly.takeHomePay,
                    result.annual.takeHomePay,
                  ],
                ].map(([label, monthly, annual]) => (
                  <tr key={String(label)}>
                    <th scope="row">{label}</th>
                    <td data-label="Monthly">{money(Number(monthly))}</td>
                    <td data-label="Annual">{money(Number(annual))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <dl className="data-list">
            <div>
              <dt>Chargeable income</dt>
              <dd>{money(result.annual.chargeableIncome)} annual</dd>
            </div>
            <div>
              <dt>Rent relief</dt>
              <dd>{money(result.annual.rentRelief)} annual</dd>
            </div>
            <div>
              <dt>Rule version</dt>
              <dd>{result.rule.version}</dd>
            </div>
            <div>
              <dt>Effective from</dt>
              <dd>{result.rule.effectiveFrom}</dd>
            </div>
            <div>
              <dt>Reviewed through</dt>
              <dd>{result.rule.reviewedThrough}</dd>
            </div>
          </dl>
          {result.warnings.length > 0 ? (
            <div className="notice notice-warning">
              <strong>Check these points</strong>
              <ul>
                {result.warnings.map((notice) => (
                  <li key={notice.code}>{notice.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <details>
            <summary>Assumptions used</summary>
            <ul>
              {result.assumptions.map((notice) => (
                <li key={notice.code}>{notice.message}</li>
              ))}
            </ul>
          </details>
          <div>
            <h3>Authoritative sources</h3>
            <ul className="source-list">
              {result.rule.sources.map((source) => (
                <li key={source.id}>
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {source.title}
                  </a>{" "}
                  — {source.authority}
                </li>
              ))}
            </ul>
          </div>
          <p className="source-policy-note">
            Estimate only. This annualises stable recurring pay and cannot
            reproduce employer cumulative/YTD true-ups, bonuses, state-specific
            public pension rules or individual professional advice.
          </p>
        </section>
      ) : null}
    </div>
  );
}
