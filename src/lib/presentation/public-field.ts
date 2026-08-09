import { formatEnum } from "@/lib/format";
import { nigeriaEligibilityBasis } from "@/lib/jobs/eligibility";
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

/**
 * The longest string still plausibly a place. Beyond this the value is prose,
 * not a location, and prose in a location slot is omitted rather than cut —
 * a truncated description would read as a stated workplace.
 */
const MAX_LOCATION_LENGTH = 120;

/** Location text suitable for public display, or null when unhelpful. */
export function publicLocation(job: Job): string | null {
  // Some feeds append the description to the location field, markup and all.
  // Take only the leading segment before the first tag or line break.
  const location = (job.locationDisplay.split(/[<\r\n]/)[0] ?? "").trim();
  if (!location) return null;
  if (location.length > MAX_LOCATION_LENGTH) return null;
  if (/^(location not stated|not stated by the source)/i.test(location)) {
    return null;
  }
  return location;
}

/**
 * Whether a remote role's wording leaves Nigeria and Africa eligibility
 * unconfirmed. Generic "remote" is not evidence that an applicant in Nigeria
 * may apply, so surfaces that summarise a role say so before the candidate
 * invests time.
 */
export function remoteEligibilityUnconfirmed(job: Job): boolean {
  return (
    job.workMode === "remote" &&
    job.eligibility.nigeria === "unclear" &&
    job.eligibility.africa === "unclear"
  );
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
  if (!isRemote) return null;

  // A Nigeria exclusion is the statement a Nigeria-first audience needs
  // before anything else, even when the role is open elsewhere in Africa.
  // The previous ordering printed a success-toned "open in named African
  // countries" badge on roles a Nigerian applicant could not apply to.
  if (job.eligibility.nigeria === "not_eligible") {
    if (
      job.eligibility.africa === "eligible" &&
      job.eligibility.scope === "named_countries"
    ) {
      return "Open in named African countries, not including Nigeria";
    }
    return "Not open to applicants in Nigeria";
  }

  // Nigeria-eligible statements state their evidence basis: a "work from
  // anywhere" role must not carry the Nigeria-specific claim.
  switch (nigeriaEligibilityBasis(job.eligibility)) {
    case "explicit":
      return "Applicants in Nigeria can apply";
    case "africa_wide":
      return "Open to applicants across Africa";
    case "worldwide_reviewed":
      return "Open to applicants worldwide";
    case null:
      break;
  }

  if (job.eligibility.scope === "emea") {
    // Africa is inside the stated region but Nigeria itself is unconfirmed;
    // the neutral tone and the drawer carry that nuance.
    return "Role open across Europe, the Middle East and Africa";
  }

  // Anything else says nothing useful: a stated non-Nigerian workplace is
  // already its own eligibility statement, and an unclear remote scope has no
  // honest one-line summary. The card stays silent and the detail page's
  // verification drawer carries the underlying evidence.
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
  // Open-elsewhere-but-not-Nigeria must never read as a green light on a
  // Nigeria-first surface.
  if (/not including nigeria/i.test(statement)) return "neutral";
  if (/can apply|open to applicants/i.test(statement)) return "success";
  return "neutral";
}
