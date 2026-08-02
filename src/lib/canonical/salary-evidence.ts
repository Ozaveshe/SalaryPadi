/**
 * Salary evidence.
 *
 * The rule that governs everything here: **an undisclosed salary never
 * becomes a stated one.** Absence of pay information is a fact about the
 * posting, and the product's value rests on that absence being visible rather
 * than filled in with something plausible.
 *
 * Estimates may exist, but they are a different kind of thing from a figure
 * the employer wrote down, and the two never merge into one number.
 */

export type SalaryBasis = "base" | "total_compensation" | "unspecified";
export type GrossNet = "gross" | "net" | "unspecified";
export type SalaryOrigin = "employer_disclosed" | "derived_estimate";

export interface SalaryEvidence {
  /** The posting's own words, preserved exactly. */
  originalText: string;
  minimum: number | null;
  maximum: number | null;
  currency: string | null;
  payPeriod: "hourly" | "daily" | "weekly" | "monthly" | "annual" | "unknown";
  grossNet: GrossNet;
  basis: SalaryBasis;
  origin: SalaryOrigin;
  /** Where the figure varies by location, the location it applies to. */
  locationScope?: string | null;
  commission?: string | null;
  bonus?: string | null;
  equity?: string | null;
  sourceReceiptId?: string | null;
  observedAt?: string | null;
  extractionConfidence: "high" | "medium" | "low";
}

/**
 * Whether a piece of evidence may be shown as the employer's stated pay.
 * A derived estimate never qualifies, however confident it is.
 */
export function isEmployerDisclosed(evidence: SalaryEvidence): boolean {
  return (
    evidence.origin === "employer_disclosed" &&
    (evidence.minimum !== null || evidence.maximum !== null) &&
    evidence.currency !== null
  );
}

export type SalaryConflict =
  | { kind: "none" }
  | {
      kind: "currency";
      currencies: readonly string[];
    }
  | { kind: "period"; periods: readonly string[] }
  | { kind: "magnitude"; ratio: number }
  | { kind: "basis"; bases: readonly SalaryBasis[] };

/**
 * How far two disclosed figures may differ before they are treated as
 * describing different things. A range whose top is more than four times its
 * bottom is not a range, it is two different roles or a parsing error.
 */
const MAGNITUDE_CONFLICT_RATIO = 4;

function midpoint(evidence: SalaryEvidence): number | null {
  const min = evidence.minimum;
  const max = evidence.maximum;
  if (min !== null && max !== null) return (min + max) / 2;
  return min ?? max;
}

/**
 * Detect disagreement between two disclosed figures for the same job.
 *
 * Conflicts are reported, never silently averaged: averaging two figures that
 * disagree produces a number no source ever stated, which is exactly the
 * invention this model exists to prevent.
 */
export function detectConflict(
  left: SalaryEvidence,
  right: SalaryEvidence,
): SalaryConflict {
  if (!isEmployerDisclosed(left) || !isEmployerDisclosed(right)) {
    return { kind: "none" };
  }

  if (left.currency !== right.currency) {
    return {
      kind: "currency",
      currencies: [left.currency ?? "", right.currency ?? ""],
    };
  }

  if (left.payPeriod !== right.payPeriod) {
    return { kind: "period", periods: [left.payPeriod, right.payPeriod] };
  }

  if (
    left.basis !== right.basis &&
    left.basis !== "unspecified" &&
    right.basis !== "unspecified"
  ) {
    return { kind: "basis", bases: [left.basis, right.basis] };
  }

  const a = midpoint(left);
  const b = midpoint(right);
  if (a !== null && b !== null && a > 0 && b > 0) {
    const ratio = Math.max(a, b) / Math.min(a, b);
    if (ratio >= MAGNITUDE_CONFLICT_RATIO) {
      return { kind: "magnitude", ratio };
    }
  }

  return { kind: "none" };
}

export type SalaryResolution =
  | { state: "disclosed"; evidence: SalaryEvidence; basis: string }
  | { state: "conflict"; conflict: SalaryConflict; basis: string }
  | { state: "undisclosed"; basis: string };

/**
 * Choose what to publish for a job.
 *
 * Employer-disclosed evidence always outranks an estimate. When two disclosed
 * figures conflict, nothing is published as the stated salary — the conflict
 * goes to review, because showing one of two contradictory figures asserts a
 * confidence the evidence does not support.
 */
export function resolveSalary(
  evidence: readonly SalaryEvidence[],
): SalaryResolution {
  const disclosed = evidence.filter(isEmployerDisclosed);

  if (disclosed.length === 0) {
    return {
      state: "undisclosed",
      basis: "No source disclosed pay for this role.",
    };
  }

  if (disclosed.length === 1) {
    return {
      state: "disclosed",
      evidence: disclosed[0],
      basis: "One disclosed figure.",
    };
  }

  for (let i = 0; i < disclosed.length - 1; i += 1) {
    for (let j = i + 1; j < disclosed.length; j += 1) {
      const conflict = detectConflict(disclosed[i], disclosed[j]);
      if (conflict.kind !== "none") {
        return {
          state: "conflict",
          conflict,
          basis:
            "Disclosed figures disagree. Nothing is published as the stated salary until a reviewer resolves it.",
        };
      }
    }
  }

  // Agreeing figures: prefer the highest-confidence, then the most recent.
  const ranked = disclosed.toSorted((a, b) => {
    const order = { high: 0, medium: 1, low: 2 } as const;
    const confidence =
      order[a.extractionConfidence] - order[b.extractionConfidence];
    if (confidence !== 0) return confidence;
    return Date.parse(b.observedAt ?? "") - Date.parse(a.observedAt ?? "");
  });

  return {
    state: "disclosed",
    evidence: ranked[0],
    basis: "Multiple agreeing disclosed figures.",
  };
}
