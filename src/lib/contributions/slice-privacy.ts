/**
 * Which salary slices may be published at all.
 *
 * Cohort thresholds answer "are there enough people in this cell?". They do
 * not answer the harder question: "does this cell describe so few people that
 * naming it identifies them, however many submissions it holds?"
 *
 * A median for `Moniepoint · Senior Backend Engineer · Yaba office · 2026`
 * with twelve submissions is still a statement about a team small enough that
 * its members can identify each other's pay. Counting harder does not fix
 * that; the slice itself is the disclosure.
 *
 * This module decides publishability from the *shape* of the slice, before
 * any count is consulted. It sits in front of the threshold table in
 * `api.privacy_thresholds`, which remains the authority on how many
 * contributors a permitted slice needs.
 */

export type SliceDimension =
  | "role"
  | "seniority"
  | "employer"
  | "country"
  | "city"
  | "office"
  | "team"
  | "employment_type"
  | "period_month";

export interface SalarySlice {
  dimensions: readonly SliceDimension[];
}

export type SliceVerdict =
  | {
      publishable: true;
      tier: "general" | "sensitive";
      minContributors: number;
    }
  | { publishable: false; reason: string };

/**
 * Dimensions that narrow a cohort to something close to an individual. Any
 * one of these in a slice makes it unpublishable regardless of count.
 *
 * `office` and `team` are here because they identify a named group of
 * colleagues who already know each other's roles. `period_month` is here
 * because pinning pay to a single month combined with an employer lets
 * anyone who knows one joiner's start date attribute the figure.
 */
const NEVER_PUBLISHABLE: ReadonlySet<SliceDimension> = new Set([
  "office",
  "team",
  "period_month",
]);

/**
 * Dimensions that are safe alone but compound. Employer plus a precise place
 * plus a level describes a handful of named people in most Nigerian
 * companies, which are far smaller than the multinationals these thresholds
 * are usually designed around.
 */
const NARROWING: ReadonlySet<SliceDimension> = new Set([
  "employer",
  "city",
  "seniority",
  "employment_type",
]);

/** Above this many narrowing dimensions, a slice is not published. */
export const MAX_NARROWING_DIMENSIONS = 2;

/** A permitted slice with no narrowing dimensions beyond role and country. */
export const GENERAL_MIN_CONTRIBUTORS = 5;

/** A permitted slice that names an employer or a city. */
export const SENSITIVE_MIN_CONTRIBUTORS = 10;

/**
 * Decide whether a slice may be published, and at what threshold.
 *
 * Deliberately independent of the submission count: the caller checks the
 * count afterwards against the returned minimum. Keeping the two apart stops
 * a large cohort from arguing its way past a shape that should never be
 * published.
 */
export function assessSlice(slice: SalarySlice): SliceVerdict {
  const dimensions = new Set(slice.dimensions);

  for (const dimension of dimensions) {
    if (NEVER_PUBLISHABLE.has(dimension)) {
      return {
        publishable: false,
        reason: `A "${dimension}" dimension identifies a group small enough that no submission count makes publication safe.`,
      };
    }
  }

  if (!dimensions.has("role")) {
    return {
      publishable: false,
      reason:
        "A salary aggregate without a role dimension is not interpretable and is not published.",
    };
  }

  const narrowing = [...dimensions].filter((dimension) =>
    NARROWING.has(dimension),
  );

  if (narrowing.length > MAX_NARROWING_DIMENSIONS) {
    return {
      publishable: false,
      reason: `Combining ${narrowing.join(", ")} narrows the cohort to individuals; this slice is not published at any count.`,
    };
  }

  return narrowing.length === 0
    ? {
        publishable: true,
        tier: "general",
        minContributors: GENERAL_MIN_CONTRIBUTORS,
      }
    : {
        publishable: true,
        tier: "sensitive",
        minContributors: SENSITIVE_MIN_CONTRIBUTORS,
      };
}

export interface CohortInput {
  slice: SalarySlice;
  /** Distinct contributing accounts, not submissions. */
  distinctContributors: number;
  /** Distinct employers, where the slice spans more than one. */
  distinctEmployers?: number;
}

export type PublicationDecision =
  | { publish: true; tier: "general" | "sensitive" }
  | { publish: false; reason: string; publicMessage: string };

/**
 * The full decision: shape first, then size.
 *
 * The public message never states the actual count. "Two more contributors
 * needed" tells a reader how many people are in the cell, which is itself a
 * disclosure about a small group.
 */
export function decidePublication(input: CohortInput): PublicationDecision {
  const verdict = assessSlice(input.slice);
  if (!verdict.publishable) {
    return {
      publish: false,
      reason: verdict.reason,
      publicMessage:
        "We do not publish pay figures at this level of detail, to protect the people who contributed them.",
    };
  }

  if (input.distinctContributors < verdict.minContributors) {
    return {
      publish: false,
      reason: `${input.distinctContributors} distinct contributors is below the ${verdict.minContributors} required for a ${verdict.tier} slice.`,
      publicMessage: "Insufficient verified data to publish a figure yet.",
    };
  }

  // A cell spanning several employers still hides individuals badly if one
  // employer supplies nearly all of it.
  if (
    input.distinctEmployers !== undefined &&
    input.distinctEmployers < 2 &&
    verdict.tier === "general"
  ) {
    return {
      publish: false,
      reason:
        "A general slice drawn from a single employer is effectively an employer slice.",
      publicMessage: "Insufficient verified data to publish a figure yet.",
    };
  }

  return { publish: true, tier: verdict.tier };
}
