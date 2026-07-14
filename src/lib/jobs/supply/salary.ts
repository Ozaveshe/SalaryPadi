import type { PayPeriod } from "../types";

export interface SourceSalaryEvidence {
  sourceText: string;
  currency: string | null;
  minimum: number | null;
  maximum: number | null;
  period: PayPeriod;
  locationScope: string | null;
  grossNet: "gross" | "net" | "unknown";
}

export interface DerivedSalaryValue {
  minimum: number | null;
  maximum: number | null;
  period: "annual" | "monthly";
  derived: true;
  assumptions: string[];
}

export interface NormalizedSalaryEvidence {
  source: SourceSalaryEvidence;
  annual: DerivedSalaryValue | null;
  monthly: DerivedSalaryValue | null;
}

const factors: Record<PayPeriod, number | null> = {
  hourly: 2_080,
  daily: 260,
  weekly: 52,
  monthly: 12,
  annual: 1,
  unknown: null,
};

const assumptions: Record<PayPeriod, string[]> = {
  hourly: ["40 work hours per week", "52 paid weeks per year"],
  daily: ["5 paid work days per week", "52 paid weeks per year"],
  weekly: ["52 paid weeks per year"],
  monthly: ["12 paid months per year"],
  annual: ["source already states an annual amount"],
  unknown: [],
};

function scaled(value: number | null, factor: number) {
  return value === null ? null : Math.round(value * factor * 100) / 100;
}

export function normalizeSalaryEvidence(
  input: SourceSalaryEvidence,
): NormalizedSalaryEvidence {
  if (
    input.minimum !== null &&
    input.maximum !== null &&
    input.maximum < input.minimum
  ) {
    throw new Error("source_salary_range_reversed");
  }
  if (
    [input.minimum, input.maximum].some(
      (value) => value !== null && (!Number.isFinite(value) || value < 0),
    )
  ) {
    throw new Error("invalid_source_salary_amount");
  }

  const factor = factors[input.period];
  if (factor === null)
    return { source: { ...input }, annual: null, monthly: null };
  const annualMinimum = scaled(input.minimum, factor);
  const annualMaximum = scaled(input.maximum, factor);
  const derivationAssumptions = [...assumptions[input.period]];
  return {
    source: { ...input },
    annual: {
      minimum: annualMinimum,
      maximum: annualMaximum,
      period: "annual",
      derived: true,
      assumptions: derivationAssumptions,
    },
    monthly: {
      minimum: scaled(annualMinimum, 1 / 12),
      maximum: scaled(annualMaximum, 1 / 12),
      period: "monthly",
      derived: true,
      assumptions: [...derivationAssumptions, "annual amount divided by 12"],
    },
  };
}
