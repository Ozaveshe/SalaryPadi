"use client";

import { useState, type FormEvent } from "react";

import { formatEnum, formatSalaryAmount } from "@/lib/format";
import {
  compareOffers,
  type OfferComparisonResult,
  type OfferInput,
  type OfferPayPeriod,
  type ContractArrangement,
  type OfferWorkMode,
} from "@/lib/offers";

function readNumber(form: FormData, name: string, optional?: false): number;
function readNumber(
  form: FormData,
  name: string,
  optional: true,
): number | undefined;
function readNumber(form: FormData, name: string, optional = false) {
  const raw = String(form.get(name) ?? "").trim();
  if (raw === "" && optional) return undefined;
  const value = Number(raw || 0);
  if (!Number.isFinite(value) || value < 0)
    throw new Error(
      `${name.replaceAll("_", " ")} must be a non-negative number.`,
    );
  return value;
}

function buildOffer(form: FormData, prefix: "a" | "b"): OfferInput {
  const currency = String(form.get(`${prefix}_currency`)).toUpperCase();
  const basePeriod = String(form.get(`${prefix}_period`)) as OfferPayPeriod;
  const periodsPerYear = readNumber(form, `${prefix}_periods_per_year`, true);
  const bonus = readNumber(form, `${prefix}_bonus`, true);
  const commission = readNumber(form, `${prefix}_commission`, true);
  const deduction = readNumber(form, `${prefix}_deductions`, true);
  const components = (names: string[]) =>
    names.flatMap((kind) => {
      const amount = readNumber(form, `${prefix}_${kind}`, true);
      return amount !== undefined && amount > 0 ? [{ kind, amount }] : [];
    });
  const benefits = components([
    "pension",
    "health",
    "transport",
    "housing",
    "lunch",
    "data",
    "equipment",
  ]);
  const costs = components([
    "remote_work",
    "electricity",
    "commute",
    "transfer",
    "exchange",
  ]);
  const equipment = String(form.get(`${prefix}_equipment_list`) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return {
    id: prefix,
    label: String(
      form.get(`${prefix}_label`) || `Offer ${prefix.toUpperCase()}`,
    ),
    basePay: {
      amount: readNumber(form, `${prefix}_base`),
      currency,
      payPeriod: basePeriod,
      ...(periodsPerYear ? { periodsPerYear } : {}),
    },
    payBasis: String(form.get(`${prefix}_basis`)) === "net" ? "net" : "gross",
    variablePay: [
      ...(bonus && bonus > 0
        ? [
            {
              kind: "bonus" as const,
              value: { amount: bonus, currency, payPeriod: "annual" as const },
              guaranteed: form.get(`${prefix}_bonus_guaranteed`) === "on",
            },
          ]
        : []),
      ...(commission && commission > 0
        ? [
            {
              kind: "commission" as const,
              value: {
                amount: commission,
                currency,
                payPeriod: "annual" as const,
              },
              guaranteed: false,
            },
          ]
        : []),
    ],
    benefits: benefits.map(({ kind, amount }) => ({
      kind: kind as
        | "pension"
        | "health"
        | "transport"
        | "housing"
        | "lunch"
        | "data"
        | "equipment",
      value: { amount, currency, payPeriod: "monthly" },
    })),
    personalCosts: costs.map(({ kind, amount }) => ({
      kind: kind as
        "remote_work" | "electricity" | "commute" | "transfer" | "exchange",
      value: { amount, currency, payPeriod: "monthly" },
    })),
    ...(deduction === undefined
      ? {}
      : {
          estimatedDeductions:
            deduction > 0
              ? [
                  {
                    label: "User-entered estimated deductions",
                    value: {
                      amount: deduction,
                      currency,
                      payPeriod: "monthly",
                    },
                  },
                ]
              : [],
        }),
    terms: {
      arrangement: String(
        form.get(`${prefix}_arrangement`),
      ) as ContractArrangement,
      workMode: String(form.get(`${prefix}_work_mode`)) as OfferWorkMode,
      paidLeaveDays: readNumber(form, `${prefix}_leave`, true),
      equipmentProvided: equipment,
      commuteHoursPerWeek: readNumber(form, `${prefix}_commute_hours`, true),
      contractTermMonths: readNumber(form, `${prefix}_contract_months`, true),
      noticePeriodDays: readNumber(form, `${prefix}_notice_days`, true),
    },
  };
}

function OfferFields({
  prefix,
  title,
  defaultCurrency,
}: {
  prefix: "a" | "b";
  title: string;
  defaultCurrency: string;
}) {
  const benefits = [
    ["pension", "Pension value"],
    ["health", "Health insurance value"],
    ["transport", "Transport"],
    ["housing", "Housing"],
    ["lunch", "Lunch"],
    ["data", "Data"],
    ["equipment", "Equipment value"],
  ] as const;
  const costs = [
    ["remote_work", "Remote-work cost"],
    ["electricity", "Electricity cost"],
    ["commute", "Commute cost"],
    ["transfer", "Transfer fees"],
    ["exchange", "Exchange cost"],
  ] as const;
  return (
    <fieldset>
      <legend>{title}</legend>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${prefix}_label`}>Offer label</label>
          <input
            className="input"
            id={`${prefix}_label`}
            name={`${prefix}_label`}
            defaultValue={title}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_base`}>Base pay</label>
          <input
            className="input"
            id={`${prefix}_base`}
            name={`${prefix}_base`}
            type="number"
            min="0"
            step="0.01"
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_currency`}>Currency</label>
          <input
            className="input"
            id={`${prefix}_currency`}
            name={`${prefix}_currency`}
            pattern="[A-Za-z]{3}"
            maxLength={3}
            defaultValue={defaultCurrency}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_period`}>Pay period</label>
          <select
            className="select"
            id={`${prefix}_period`}
            name={`${prefix}_period`}
            defaultValue="monthly"
          >
            <option value="hourly">Hourly</option>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_periods_per_year`}>
            Paid periods/year
          </label>
          <input
            className="input"
            id={`${prefix}_periods_per_year`}
            name={`${prefix}_periods_per_year`}
            type="number"
            min="1"
            step="1"
          />
          <p className="field-help">Required for hourly or daily pay.</p>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_basis`}>Amount is</label>
          <select
            className="select"
            id={`${prefix}_basis`}
            name={`${prefix}_basis`}
          >
            <option value="gross">Gross</option>
            <option value="net">Net</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_bonus`}>Annual bonus</label>
          <input
            className="input"
            id={`${prefix}_bonus`}
            name={`${prefix}_bonus`}
            type="number"
            min="0"
            step="0.01"
          />
        </div>
        <label className="checkbox">
          <input type="checkbox" name={`${prefix}_bonus_guaranteed`} />
          Bonus is guaranteed
        </label>
        <div className="field">
          <label htmlFor={`${prefix}_commission`}>Annual commission</label>
          <input
            className="input"
            id={`${prefix}_commission`}
            name={`${prefix}_commission`}
            type="number"
            min="0"
            step="0.01"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_deductions`}>
            Estimated monthly deductions
          </label>
          <input
            className="input"
            id={`${prefix}_deductions`}
            name={`${prefix}_deductions`}
            type="number"
            min="0"
            step="0.01"
          />
          <p className="field-help">
            Leave blank if unknown; enter 0 only when explicitly estimating
            zero.
          </p>
        </div>
      </div>
      <h3>Monthly benefit values</h3>
      <div className="form-grid">
        {benefits.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={`${prefix}_${name}`}>{label}</label>
            <input
              className="input"
              id={`${prefix}_${name}`}
              name={`${prefix}_${name}`}
              type="number"
              min="0"
              step="0.01"
            />
          </div>
        ))}
      </div>
      <h3>Monthly personal work costs</h3>
      <div className="form-grid">
        {costs.map(([name, label]) => (
          <div className="field" key={name}>
            <label htmlFor={`${prefix}_${name}`}>{label}</label>
            <input
              className="input"
              id={`${prefix}_${name}`}
              name={`${prefix}_${name}`}
              type="number"
              min="0"
              step="0.01"
            />
          </div>
        ))}
      </div>
      <h3>Terms</h3>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`${prefix}_arrangement`}>Arrangement</label>
          <select
            className="select"
            id={`${prefix}_arrangement`}
            name={`${prefix}_arrangement`}
          >
            <option value="employee">Employee</option>
            <option value="contractor">Contractor</option>
            <option value="freelance">Freelance</option>
            <option value="fixed_term">Fixed term</option>
            <option value="internship">Internship</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_work_mode`}>Work mode</label>
          <select
            className="select"
            id={`${prefix}_work_mode`}
            name={`${prefix}_work_mode`}
          >
            <option value="remote">Remote</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">Onsite</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_leave`}>Paid leave days/year</label>
          <input
            className="input"
            id={`${prefix}_leave`}
            name={`${prefix}_leave`}
            type="number"
            min="0"
            step="1"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_commute_hours`}>Commute hours/week</label>
          <input
            className="input"
            id={`${prefix}_commute_hours`}
            name={`${prefix}_commute_hours`}
            type="number"
            min="0"
            step="0.5"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_contract_months`}>
            Contract term (months)
          </label>
          <input
            className="input"
            id={`${prefix}_contract_months`}
            name={`${prefix}_contract_months`}
            type="number"
            min="0"
            step="1"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_notice_days`}>Notice period (days)</label>
          <input
            className="input"
            id={`${prefix}_notice_days`}
            name={`${prefix}_notice_days`}
            type="number"
            min="0"
            step="1"
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}_equipment_list`}>Equipment provided</label>
          <input
            className="input"
            id={`${prefix}_equipment_list`}
            name={`${prefix}_equipment_list`}
            placeholder="Laptop, monitor"
          />
        </div>
      </div>
    </fieldset>
  );
}

function resultMoney(value: number | null, currency: string) {
  return value === null ? "Unknown" : formatSalaryAmount(value, currency);
}

export function OfferCompare() {
  const [result, setResult] = useState<OfferComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const form = new FormData(event.currentTarget);
      const comparisonCurrency = String(
        form.get("comparison_currency"),
      ).toUpperCase();
      const offerA = buildOffer(form, "a");
      const offerB = buildOffer(form, "b");
      const rates = (["a", "b"] as const).flatMap((prefix) => {
        const offer = prefix === "a" ? offerA : offerB;
        if (offer.basePay.currency === comparisonCurrency) return [];
        const rate = readNumber(form, `${prefix}_fx_rate`, true);
        return rate
          ? [
              {
                from: offer.basePay.currency,
                to: comparisonCurrency,
                rate,
                sourceLabel: "User-entered rate",
                asOf: String(form.get("rate_date") || ""),
              },
            ]
          : [];
      });
      setResult(
        compareOffers({ offerA, offerB, comparisonCurrency, fxRates: rates }),
      );
    } catch (reason) {
      setResult(null);
      setError(
        reason instanceof Error
          ? reason.message
          : "Check both offers and FX rates.",
      );
    }
  }
  return (
    <div className="tool-workspace">
      <form className="contribution-form" onSubmit={submit}>
        <fieldset>
          <legend>Comparison basis</legend>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="comparison_currency">Comparison currency</label>
              <input
                className="input"
                id="comparison_currency"
                name="comparison_currency"
                defaultValue="NGN"
                pattern="[A-Za-z]{3}"
                maxLength={3}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="a_fx_rate">
                Offer A rate to comparison currency
              </label>
              <input
                className="input"
                id="a_fx_rate"
                name="a_fx_rate"
                type="number"
                min="0"
                step="0.000001"
              />
              <p className="field-help">
                Units of comparison currency for one unit of Offer A currency.
              </p>
            </div>
            <div className="field">
              <label htmlFor="b_fx_rate">
                Offer B rate to comparison currency
              </label>
              <input
                className="input"
                id="b_fx_rate"
                name="b_fx_rate"
                type="number"
                min="0"
                step="0.000001"
              />
            </div>
            <div className="field">
              <label htmlFor="rate_date">Rate date</label>
              <input
                className="input"
                id="rate_date"
                name="rate_date"
                type="date"
              />
            </div>
          </div>
          <p className="field-help">
            SalaryPadi does not fetch or invent an exchange rate. Enter a rate
            you trust and include transfer/exchange costs below.
          </p>
        </fieldset>
        <div className="offer-grid">
          <OfferFields prefix="a" title="Offer A" defaultCurrency="NGN" />
          <OfferFields prefix="b" title="Offer B" defaultCurrency="USD" />
        </div>
        <button className="button w-fit" type="submit">
          Compare offers
        </button>
      </form>
      {error ? (
        <div className="notice notice-danger" role="alert">
          {error}
        </div>
      ) : null}
      {result ? (
        <section className="tool-result stack-lg">
          <div role="status" aria-live="polite">
            <p className="eyebrow">Normalized comparison</p>
            <h2 className="section-title">
              Monthly and annual value in {result.comparisonCurrency}
            </h2>
          </div>
          <div className="admin-table-wrap">
            <table className="breakdown-table">
              <thead>
                <tr>
                  <th scope="col">Measure</th>
                  <th scope="col">{result.offerA.label}</th>
                  <th scope="col">{result.offerB.label}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Base pay", result.offerA.basePay, result.offerB.basePay],
                  [
                    "Guaranteed cash",
                    result.offerA.guaranteedCashCompensation,
                    result.offerB.guaranteedCashCompensation,
                  ],
                  [
                    "Total cash",
                    result.offerA.totalCashCompensation,
                    result.offerB.totalCashCompensation,
                  ],
                  [
                    "Benefit value",
                    result.offerA.estimatedBenefitValue,
                    result.offerB.estimatedBenefitValue,
                  ],
                  [
                    "Personal work costs",
                    result.offerA.personalWorkCosts,
                    result.offerB.personalWorkCosts,
                  ],
                  [
                    "Estimated cash take-home",
                    result.offerA.estimatedCashTakeHome,
                    result.offerB.estimatedCashTakeHome,
                  ],
                  [
                    "Effective value",
                    result.offerA.effectiveValue,
                    result.offerB.effectiveValue,
                  ],
                ].map(([label, a, b]) => {
                  const left = a as typeof result.offerA.basePay | null;
                  const right = b as typeof result.offerB.basePay | null;
                  return (
                    <tr key={String(label)}>
                      <th scope="row">{String(label)}</th>
                      <td data-label={result.offerA.label}>
                        {resultMoney(
                          left?.monthly ?? null,
                          result.comparisonCurrency,
                        )}{" "}
                        / month
                        <br />
                        <small>
                          {resultMoney(
                            left?.annual ?? null,
                            result.comparisonCurrency,
                          )}{" "}
                          / year
                        </small>
                      </td>
                      <td data-label={result.offerB.label}>
                        {resultMoney(
                          right?.monthly ?? null,
                          result.comparisonCurrency,
                        )}{" "}
                        / month
                        <br />
                        <small>
                          {resultMoney(
                            right?.annual ?? null,
                            result.comparisonCurrency,
                          )}{" "}
                          / year
                        </small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {result.nonFinancialDifferences.length > 0 ? (
            <div>
              <h3>Important non-financial differences</h3>
              <ul>
                {result.nonFinancialDifferences.map((difference) => (
                  <li key={difference.kind}>
                    <strong>{formatEnum(difference.kind)}:</strong>{" "}
                    {difference.summary}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h3>Practical negotiation points</h3>
            <div className="stack">
              {result.negotiationTalkingPoints.map((point, index) => (
                <article className="notice" key={`${point.kind}-${index}`}>
                  <strong>{point.title}</strong>
                  <p>{point.evidence}</p>
                  <p>{point.suggestion}</p>
                </article>
              ))}
            </div>
          </div>
          <details>
            <summary>Normalization notes and warnings</summary>
            <ul>
              {[
                ...result.normalizationNotes,
                ...result.offerA.warnings,
                ...result.offerB.warnings,
              ].map((note, index) => (
                <li key={`${index}-${note}`}>{note}</li>
              ))}
            </ul>
          </details>
          <p className="source-policy-note">
            All talking points are derived only from the values and terms you
            entered. No market salary claim is generated.
          </p>
        </section>
      ) : null}
    </div>
  );
}
