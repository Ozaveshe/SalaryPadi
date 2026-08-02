/**
 * Canonical job identity.
 *
 * A canonical job is one real vacancy. Several sources may describe it, and
 * the same employer may run several genuinely different vacancies with
 * identical titles. Deduplicating on title would collapse the second case;
 * refusing to deduplicate at all would show the first case three times.
 *
 * Identity therefore rests on evidence, and the strongest available evidence
 * decides. A requisition ID from the employer's own ATS is proof; a title
 * that happens to match is not.
 */

export interface JobIdentityFacts {
  employerId: string;
  /** The employer's own requisition or posting ID, when the source carries one. */
  requisitionId?: string | null;
  title: string;
  /** City, region or country as normalised by the location classifier. */
  locationKey?: string | null;
  workArrangement?: string | null;
  employmentType?: string | null;
  /** Host of the application destination. */
  destinationHost?: string | null;
  /** Full destination URL, used only for exact-destination matching. */
  destinationUrl?: string | null;
  publishedAt?: string | null;
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9+#/ ]/g, " ")
    .replace(
      /\b(remote|hybrid|onsite|on-site|full[- ]time|part[- ]time|contract|permanent|urgent|hiring|now)\b/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The deterministic fingerprint. Two records sharing one are the same
 * vacancy; the components are chosen so that a coincidence across all of
 * them is not plausible.
 */
export function jobFingerprint(facts: JobIdentityFacts): string {
  if (facts.requisitionId) {
    // The employer's own ID for the vacancy. Nothing else is needed.
    return `req:${facts.employerId}:${facts.requisitionId.toLowerCase()}`;
  }
  return [
    "cmp",
    facts.employerId,
    normalizeTitle(facts.title),
    facts.locationKey ?? "",
    facts.workArrangement ?? "",
    facts.employmentType ?? "",
    facts.destinationHost ?? "",
  ].join("|");
}

export type MatchDecision =
  | { kind: "same"; basis: string }
  | { kind: "review"; basis: string; similarity: number }
  | { kind: "different"; basis: string };

const TITLE_REVIEW_THRESHOLD = 0.9;

function titleSimilarity(a: string, b: string): number {
  const left = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const right = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

const PUBLICATION_WINDOW_DAYS = 45;

function withinPublicationWindow(
  a?: string | null,
  b?: string | null,
): boolean {
  if (!a || !b) return true;
  const left = Date.parse(a);
  const right = Date.parse(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  const days = Math.abs(left - right) / 86_400_000;
  return days <= PUBLICATION_WINDOW_DAYS;
}

/**
 * Compare two records that may describe the same vacancy.
 *
 * Returns `same` only on deterministic evidence. Everything softer returns
 * `review`, which writes an `audit.job_duplicate_candidates` row for a human
 * — the system performs zero automatic fuzzy merges.
 */
export function compareJobs(
  left: JobIdentityFacts,
  right: JobIdentityFacts,
): MatchDecision {
  if (left.employerId !== right.employerId) {
    return {
      kind: "different",
      basis: "Different employers. Nothing below this matters.",
    };
  }

  if (left.requisitionId && right.requisitionId) {
    const same =
      left.requisitionId.toLowerCase() === right.requisitionId.toLowerCase();
    return same
      ? { kind: "same", basis: "Identical employer requisition ID." }
      : {
          kind: "different",
          basis:
            "The employer gave these vacancies different requisition IDs, so the employer considers them different roles.",
        };
  }

  if (
    left.destinationUrl &&
    right.destinationUrl &&
    left.destinationUrl === right.destinationUrl
  ) {
    return {
      kind: "same",
      basis: "Identical application destination.",
    };
  }

  if (jobFingerprint(left) === jobFingerprint(right)) {
    return { kind: "same", basis: "Identical evidence fingerprint." };
  }

  const similarity = titleSimilarity(left.title, right.title);

  // The trap this guards: one employer running several genuinely different
  // vacancies under one title, distinguished only by location.
  if (
    similarity >= TITLE_REVIEW_THRESHOLD &&
    left.locationKey &&
    right.locationKey &&
    left.locationKey !== right.locationKey
  ) {
    return {
      kind: "different",
      basis:
        "Same title at the same employer but different locations. These are different vacancies unless a reviewer says otherwise.",
    };
  }

  if (
    similarity >= TITLE_REVIEW_THRESHOLD &&
    withinPublicationWindow(left.publishedAt, right.publishedAt)
  ) {
    return {
      kind: "review",
      basis:
        "High title similarity at one employer. Queued for review; never merged automatically.",
      similarity,
    };
  }

  return {
    kind: "different",
    basis: "No deterministic evidence and title similarity below threshold.",
  };
}

/**
 * Source authority, mirroring `ingest.job_occurrence_links.authority`.
 * Lower wins.
 */
export const SOURCE_AUTHORITY_ORDER = [
  "direct_employer",
  "employer_ats",
  "licensed_partner",
  "secondary_feed",
] as const;

export type SourceAuthority = (typeof SOURCE_AUTHORITY_ORDER)[number];

export function authorityRank(authority: SourceAuthority): number {
  return SOURCE_AUTHORITY_ORDER.indexOf(authority) + 1;
}

export interface SourceOccurrence {
  occurrenceId: string;
  authority: SourceAuthority;
  observedAt: string;
}

/**
 * Which occurrence supplies the canonical assertions.
 *
 * Losing occurrences are never discarded: they remain linked as evidence
 * that the vacancy was seen elsewhere. Ties break on recency.
 */
export function preferredOccurrence(
  occurrences: readonly SourceOccurrence[],
): SourceOccurrence | null {
  if (occurrences.length === 0) return null;
  return occurrences.toSorted((a, b) => {
    const rank = authorityRank(a.authority) - authorityRank(b.authority);
    if (rank !== 0) return rank;
    return Date.parse(b.observedAt) - Date.parse(a.observedAt);
  })[0];
}
