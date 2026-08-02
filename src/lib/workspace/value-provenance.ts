/**
 * Value provenance in the Pay & Offer workspace.
 *
 * A workspace mixes facts from four different worlds: what the employer
 * wrote down, what the user typed, what we computed, and what we assumed to
 * be able to compute it. Once those are all rendered as plain numbers they
 * become indistinguishable, and the most damaging failure in this product
 * follows immediately — an assumed figure read back as an employer's promise.
 *
 * Every number in the workspace therefore carries where it came from, and
 * the type system makes it awkward to lose that. A calculation over tagged
 * values yields a tagged value; there is no arithmetic that quietly returns
 * a bare number.
 */

export type ValueOrigin =
  /** The employer stated this. The only origin that may be called a fact. */
  | "employer_disclosed"
  /** The user typed it. True for them, not verified by us. */
  | "user_entered"
  /** We computed it from other tagged values. */
  | "calculated"
  /** We supplied it to make a calculation possible. */
  | "assumption"
  /** Derived, with material uncertainty we cannot remove. */
  | "estimated"
  /** We do not know, and say so. */
  | "unknown";

export interface ProvenancedValue<T = number> {
  value: T | null;
  origin: ValueOrigin;
  /** Consumer-facing note explaining the origin, shown next to the number. */
  note?: string;
  /** When the underlying source stated this, for disclosed values. */
  sourceTimestamp?: string | null;
}

export function disclosed<T>(
  value: T,
  sourceTimestamp?: string | null,
): ProvenancedValue<T> {
  return {
    value,
    origin: "employer_disclosed",
    sourceTimestamp: sourceTimestamp ?? null,
  };
}

export function entered<T>(value: T): ProvenancedValue<T> {
  return { value, origin: "user_entered" };
}

export function assumed<T>(value: T, note: string): ProvenancedValue<T> {
  return { value, origin: "assumption", note };
}

export function unknown<T>(note?: string): ProvenancedValue<T> {
  return { value: null, origin: "unknown", note };
}

/** Origins ordered by how much weight a reader may place on them. */
const ORIGIN_STRENGTH: Record<ValueOrigin, number> = {
  employer_disclosed: 5,
  user_entered: 4,
  calculated: 3,
  estimated: 2,
  assumption: 1,
  unknown: 0,
};

/**
 * A calculation is only ever as trustworthy as its weakest input.
 *
 * Combining an employer-disclosed salary with an assumed tax band produces an
 * estimate, never a disclosed figure. This is the rule that stops an
 * assumption laundering itself into a fact by passing through arithmetic.
 */
export function combineOrigins(
  inputs: readonly ProvenancedValue<unknown>[],
): ValueOrigin {
  if (inputs.length === 0) return "unknown";
  if (inputs.some((input) => input.value === null)) return "unknown";

  const weakest = inputs.reduce(
    (lowest, input) =>
      ORIGIN_STRENGTH[input.origin] < ORIGIN_STRENGTH[lowest]
        ? input.origin
        : lowest,
    inputs[0]!.origin,
  );

  // Anything resting on an assumption or an estimate is an estimate. Anything
  // resting only on stated or entered values is a calculation.
  if (weakest === "assumption" || weakest === "estimated") return "estimated";
  if (weakest === "unknown") return "unknown";
  return "calculated";
}

/**
 * Apply a numeric function to tagged inputs, carrying provenance through.
 * Returns unknown when any input is unknown, rather than treating a missing
 * number as zero — a missing bonus is not a bonus of nothing.
 */
export function computeValue(
  inputs: readonly ProvenancedValue<number>[],
  compute: (values: number[]) => number,
  note?: string,
): ProvenancedValue<number> {
  const origin = combineOrigins(inputs);
  if (origin === "unknown") {
    return {
      value: null,
      origin: "unknown",
      note: note ?? "Not enough information to calculate this.",
    };
  }
  const values = inputs.map((input) => input.value as number);
  const result = compute(values);
  if (!Number.isFinite(result)) {
    return {
      value: null,
      origin: "unknown",
      note: "Calculation not possible.",
    };
  }
  return { value: result, origin, note };
}

/** Labels shown beside a number, so the reader knows what kind of thing it is. */
export const ORIGIN_LABELS: Record<ValueOrigin, string> = {
  employer_disclosed: "Stated by the employer",
  user_entered: "You entered this",
  calculated: "Calculated by SalaryPadi",
  assumption: "SalaryPadi assumption",
  estimated: "Estimate",
  unknown: "Not known",
};

/** True when a value may be presented as something the employer committed to. */
export function isEmployerFact(value: ProvenancedValue<unknown>): boolean {
  return value.origin === "employer_disclosed" && value.value !== null;
}

/**
 * Format for display. Estimates and assumptions are always marked, so a
 * screenshot of the workspace cannot misrepresent one as a stated figure.
 */
export function displaySuffix(value: ProvenancedValue<unknown>): string {
  switch (value.origin) {
    case "estimated":
    case "assumption":
      return " (est.)";
    case "unknown":
      return "";
    default:
      return "";
  }
}

export interface AssumptionRecord {
  label: string;
  detail: string;
}

/**
 * Every assumption behind a workspace result, for the "what did you assume"
 * disclosure. A result with no visible assumptions is only honest when there
 * genuinely were none.
 */
export function collectAssumptions(
  values: readonly ProvenancedValue<unknown>[],
): AssumptionRecord[] {
  return values
    .filter(
      (value) =>
        (value.origin === "assumption" || value.origin === "estimated") &&
        value.note,
    )
    .map((value) => ({
      label: ORIGIN_LABELS[value.origin],
      detail: value.note as string,
    }));
}

export type ScenarioName = "conservative" | "expected" | "optimistic";

export interface ScenarioResult {
  scenario: ScenarioName;
  monthlyEffective: ProvenancedValue<number>;
  annualEffective: ProvenancedValue<number>;
}

export interface OfferSummary {
  label: string;
  scenarios: Record<ScenarioName, ScenarioResult>;
  /** Non-financial factors the numbers cannot capture. */
  tradeOffs: string[];
}

export interface DecisionSummary {
  /** One sentence per offer describing what it is stronger at. */
  statements: string[];
  /** Factors the comparison could not price. */
  unpriced: string[];
  /** Deliberately absent: there is no winner field. */
  note: string;
}

/**
 * Summarise a comparison without declaring a winner.
 *
 * Which offer is better depends on things the workspace cannot see — how much
 * someone values health cover, whether they can absorb currency risk, what
 * the commute costs them in energy rather than naira. Naming a winner would
 * present a preference as a calculation.
 */
export function summariseComparison(
  offers: readonly OfferSummary[],
): DecisionSummary {
  const statements: string[] = [];
  const unpriced: string[] = [];

  for (const offer of offers) {
    const expected = offer.scenarios.expected.monthlyEffective;
    if (expected.value === null) {
      statements.push(
        `${offer.label}: not enough information to estimate monthly compensation.`,
      );
    } else {
      const others = offers.filter((other) => other !== offer);
      const highest = others.every((other) => {
        const value = other.scenarios.expected.monthlyEffective.value;
        return value === null || expected.value! > value;
      });
      statements.push(
        highest
          ? `${offer.label} provides higher estimated monthly cash compensation.`
          : `${offer.label} provides lower estimated monthly cash compensation.`,
      );
    }
    for (const tradeOff of offer.tradeOffs) {
      unpriced.push(`${offer.label}: ${tradeOff}`);
    }
  }

  return {
    statements,
    unpriced,
    note: "These figures are estimates. Which offer suits you depends on factors only you can weigh.",
  };
}
