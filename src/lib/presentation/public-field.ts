import { formatEnum } from "@/lib/format";
import type { Job } from "@/lib/jobs/types";

/**
 * The public presentation boundary for uncertain data.
 *
 * The database deliberately preserves uncertainty (unknown, unspecified,
 * unclear, not stated); the customer-facing surface must never print those
 * internal states. Everything a public component renders for an uncertain
 * field goes through this module: a field is either presented as a known
 * value, presented as a genuinely useful absence statement, or omitted.
 */

/**
 * Labels that must never reach a public surface. The prohibited-labels
 * regression test renders public components against uncertain fixtures and
 * fails when any of these appear.
 */
export const PROHIBITED_PUBLIC_LABELS = [
  "Unknown",
  "Unclear",
  "unclear",
  "None applied",
  "Not stated",
  "null",
  "N/A",
  "Deterministic coverage",
  "Coverage complete",
  "Checks applied",
  "Evidence lane",
  "Parser confidence",
  "Extraction confidence",
  "Moderation state",
] as const;

/** Internal sentinel values that mean "we do not know". */
const UNCERTAIN_ENUM_VALUES = new Set([
  "unknown",
  "unclear",
  "unspecified",
  "not_stated",
  "none",
  "",
]);

/**
 * A known enum value formatted for display, or null when the value is an
 * internal uncertainty sentinel. Callers omit the field on null.
 */
export function publicEnum(value: string | null | undefined): string | null {
  if (!value || UNCERTAIN_ENUM_VALUES.has(value)) return null;
  return formatEnum(value);
}

/** Location text suitable for public display, or null when unhelpful. */
export function publicLocation(job: Job): string | null {
  const location = job.locationDisplay.trim();
  if (!location) return null;
  if (/^(location not stated|not stated by the source)/i.test(location)) {
    return null;
  }
  return location;
}

/**
 * The single candidate-facing eligibility statement for a job. Collapses
 * the internal eligibility × work-mode × location facts into one sentence a
 * candidate can act on, or null when nothing useful can be said (the card
 * then simply says nothing, and the detail page's verification drawer
 * carries the underlying evidence).
 */
export function publicEligibilityStatement(job: Job): string | null {
  const location = publicLocation(job);
  const isRemote = job.workMode === "remote";

  if (!isRemote && location && /\bnigeria\b/i.test(location)) {
    if (job.workMode === "hybrid") return "Hybrid role based in Nigeria";
    if (job.workMode === "onsite") return "On-site role in Nigeria";
    // Work mode uncertain: state only what the source stated.
    return "Role based in Nigeria";
  }
  if (isRemote && job.eligibility.nigeria === "eligible") {
    return "Applicants in Nigeria can apply";
  }
  if (isRemote && job.eligibility.africa === "eligible") {
    return "Open to applicants in named African countries";
  }
  if (isRemote && job.eligibility.scope === "worldwide") {
    return "Open to applicants worldwide";
  }
  if (isRemote && job.eligibility.nigeria === "not_eligible") {
    return "Not open to applicants in Nigeria";
  }
  if (!isRemote && location) {
    // A stated non-Nigerian workplace is itself the eligibility statement.
    return null;
  }
  return null;
}

/**
 * Whether a badge for the eligibility statement should carry the success
 * tone (candidate can act) or the plain tone.
 */
export function eligibilityStatementTone(
  statement: string,
): "success" | "neutral" | "danger" {
  if (/^not open/i.test(statement)) return "danger";
  if (/can apply|open to applicants/i.test(statement)) return "success";
  return "neutral";
}
