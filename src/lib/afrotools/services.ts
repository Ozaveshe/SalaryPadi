import "server-only";

import {
  invalidAfroToolsResponse,
  requestAfroTools,
} from "@/lib/afrotools/client";
import {
  afroToolsFxResponseSchema,
  afroToolsPayeResponseSchema,
  afroToolsTaxRatesSchema,
} from "@/lib/afrotools/schemas";

export type AfroToolsFxEvidence = {
  from: string;
  to: string;
  rate: number;
  source: string;
  updatedAt: string;
  freshness: "fresh" | "stale";
  sandbox: boolean;
  dataPolicy: string;
};

const FX_FRESH_MS = 36 * 60 * 60 * 1_000;
const FX_MAX_STALE_MS = 30 * 24 * 60 * 60 * 1_000;

export async function getAfroToolsFxRate(
  from: string,
  to: string,
  now = new Date(),
): Promise<AfroToolsFxEvidence> {
  if (from === to) {
    return {
      from,
      to,
      rate: 1,
      source: "Identity conversion",
      updatedAt: now.toISOString(),
      freshness: "fresh",
      sandbox: false,
      dataPolicy: "No provider rate required",
    };
  }
  const raw = await requestAfroTools("/fx/rates", {
    method: "GET",
    query: { base: from, target: to, amount: 1 },
  });
  const parsed = afroToolsFxResponseSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.base !== from ||
    parsed.data.target !== to ||
    parsed.data.pair !== `${from}/${to}`
  ) {
    throw invalidAfroToolsResponse();
  }
  const observed = Date.parse(parsed.data.updated_at);
  const ageMs = now.valueOf() - observed;
  if (
    !Number.isFinite(observed) ||
    ageMs < -5 * 60 * 1_000 ||
    ageMs > FX_MAX_STALE_MS
  ) {
    throw invalidAfroToolsResponse();
  }
  return {
    from,
    to,
    rate: parsed.data.rate,
    source: parsed.data.source,
    updatedAt: parsed.data.updated_at,
    freshness: ageMs <= FX_FRESH_MS ? "fresh" : "stale",
    sandbox: parsed.data.sandbox,
    dataPolicy: parsed.data.data_policy,
  };
}

export async function calculateAfroToolsPaye(
  input: {
    country: "NG";
    mode: "gross_to_net" | "net_to_gross";
    period: "monthly" | "annual";
    amount: number;
  },
  now = new Date(),
) {
  const salaryField = `${input.mode === "gross_to_net" ? "gross" : "net"}${
    input.period === "monthly" ? "Monthly" : "Annual"
  }`;
  const [calculationRaw, rulesRaw] = await Promise.all([
    requestAfroTools("/tax/paye", {
      method: "POST",
      body: { country: input.country, [salaryField]: input.amount },
    }),
    requestAfroTools("/tax/rates", {
      method: "GET",
      query: { country: input.country, type: "paye" },
    }),
  ]);
  const calculation = afroToolsPayeResponseSchema.safeParse(calculationRaw);
  const rules = afroToolsTaxRatesSchema.safeParse(rulesRaw);
  if (!calculation.success || !rules.success) throw invalidAfroToolsResponse();
  const verifiedAt = Date.parse(calculation.data._meta.timestamp);
  const verificationAgeMs = now.valueOf() - verifiedAt;
  const currentRulesYear = String(now.getUTCFullYear());
  if (
    !Number.isFinite(verifiedAt) ||
    verificationAgeMs < -5 * 60 * 1_000 ||
    verificationAgeMs > 24 * 60 * 60 * 1_000 ||
    !rules.data.paye.year.startsWith(currentRulesYear)
  ) {
    throw invalidAfroToolsResponse();
  }

  const requestedNetAnnual =
    input.mode === "net_to_gross"
      ? input.period === "monthly"
        ? input.amount * 12
        : input.amount
      : null;
  if (
    requestedNetAnnual !== null &&
    Math.abs(calculation.data.result.netAnnual - requestedNetAnnual) >
      Math.max(1, requestedNetAnnual * 0.005)
  ) {
    throw invalidAfroToolsResponse();
  }

  const grossAnnual = calculation.data.input.grossAnnual;
  return {
    grossAnnual,
    grossMonthly: grossAnnual / 12,
    netAnnual: calculation.data.result.netAnnual,
    netMonthly: calculation.data.result.netMonthly,
    incomeTaxAnnual: calculation.data.tax.netTax,
    taxableIncomeAnnual: calculation.data.tax.taxableIncome,
    deductionsAnnual:
      calculation.data.deductions.totalDeductions ??
      calculation.data.deductions.pension ??
      0,
    effectiveRate: calculation.data.result.effectiveRate ?? null,
    evidence: {
      provider: "AfroTools",
      apiVersion: calculation.data._meta.version,
      rulesVersion: rules.data.paye.regimes.join(", "),
      rulesYear: rules.data.paye.year,
      source: rules.data.paye.source,
      taxAuthority: rules.data.tax_authority,
      lastVerifiedAt: calculation.data._meta.timestamp,
      dataPolicy: calculation.data._meta.dataPolicy,
      docsUrl: calculation.data._meta.docs,
      sandbox: calculation.data._meta.sandbox || rules.data.sandbox,
    },
  };
}
