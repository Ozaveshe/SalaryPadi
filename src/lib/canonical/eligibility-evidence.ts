/**
 * Eligibility evidence.
 *
 * Whether a Nigerian candidate can actually apply is the most valuable fact
 * SalaryPadi holds, and the easiest to get wrong in the direction that hurts.
 * Eligibility is therefore stored as evidence with its own source text; the
 * badge is derived from evidence and can always be traced back to the words
 * that produced it.
 *
 * The rule that defines the product: **"remote" alone never becomes "open to
 * Nigeria."** Most remote roles are remote within a country the candidate is
 * not in. A hopeful yes costs someone an application and some of their belief
 * that the search is worth continuing; an honest "not resolved" costs them
 * nothing.
 */

export const ELIGIBILITY_EVIDENCE_TYPES = [
  "explicitly_accepts_nigeria",
  "explicitly_accepts_africa",
  "explicit_country_list",
  "global_remote",
  "remote_with_country_restrictions",
  "local_presence_requirement",
  "work_authorisation_requirement",
  "timezone_restriction",
  "payroll_restriction",
  "citizenship_restriction",
  "eligibility_unclear",
  "explicitly_excludes_nigeria",
] as const;

export type EligibilityEvidenceType =
  (typeof ELIGIBILITY_EVIDENCE_TYPES)[number];

export type ExtractionMethod = "structured_field" | "pattern" | "manual_review";

export interface EligibilityEvidence {
  type: EligibilityEvidenceType;
  /** The receipt this came from, so the badge is traceable. */
  sourceReceiptId?: string | null;
  /** The source's own words. Never paraphrased. */
  sourceText: string;
  countries?: readonly string[];
  inclusion: "include" | "exclude" | "neutral";
  observedAt?: string | null;
  extractionMethod: ExtractionMethod;
  confidence: "high" | "medium" | "low";
  reviewState?: "unreviewed" | "confirmed" | "rejected";
  expiresAt?: string | null;
}

export type EligibilityVerdict =
  "eligible" | "not_eligible" | "unclear" | "not_stated";

const NIGERIA = "NG";

/** Regions whose wording includes Nigeria. Africa is a subset of EMEA. */
const REGIONS_INCLUDING_NIGERIA = new Set([
  "africa",
  "emea",
  "worldwide",
  "global",
  "anywhere",
]);

/**
 * Wordings that genuinely mean worldwide. A bare "anywhere" is excluded on
 * purpose: a mission statement containing "essential goods anytime, anywhere"
 * once published a US-only role as worldwide-eligible.
 */
const GLOBAL_REMOTE_PATTERNS = [
  /work from anywhere/i,
  /anywhere in the world/i,
  /\bfully remote\b.*\bworldwide\b/i,
  /\bremote\b.*\bworldwide\b/i,
  /\bglobally remote\b/i,
];

/** Wording that is remote and nothing more. Never resolves to a country. */
const BARE_REMOTE = /^\s*(fully\s+)?remote\s*$/i;

export function isBareRemote(text: string): boolean {
  return BARE_REMOTE.test(text);
}

export function statesGlobalRemote(text: string): boolean {
  return GLOBAL_REMOTE_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Derive the public verdict from stored evidence.
 *
 * Exclusions win over inclusions: if a source both names Africa and excludes
 * Nigeria, the exclusion is the operative fact for a Nigerian candidate.
 */
export function deriveVerdict(evidence: readonly EligibilityEvidence[]): {
  verdict: EligibilityVerdict;
  basis: string;
} {
  if (evidence.length === 0) {
    return {
      verdict: "not_stated",
      basis: "The posting says nothing about eligibility.",
    };
  }

  const usable = evidence.filter((item) => item.reviewState !== "rejected");

  const excluded = usable.find(
    (item) =>
      item.type === "explicitly_excludes_nigeria" ||
      (item.inclusion === "exclude" && item.countries?.includes(NIGERIA)),
  );
  if (excluded) {
    return {
      verdict: "not_eligible",
      basis: `The posting excludes Nigeria: "${excluded.sourceText}".`,
    };
  }

  const restrictive = usable.find((item) =>
    (
      [
        "citizenship_restriction",
        "work_authorisation_requirement",
        "payroll_restriction",
        "local_presence_requirement",
      ] as EligibilityEvidenceType[]
    ).includes(item.type),
  );
  if (
    restrictive &&
    restrictive.countries &&
    restrictive.countries.length > 0 &&
    !restrictive.countries.includes(NIGERIA)
  ) {
    return {
      verdict: "not_eligible",
      basis: `The posting requires something Nigeria is not covered by: "${restrictive.sourceText}".`,
    };
  }

  const included = usable.find(
    (item) =>
      item.type === "explicitly_accepts_nigeria" ||
      (item.inclusion === "include" && item.countries?.includes(NIGERIA)),
  );
  if (included) {
    return {
      verdict: "eligible",
      basis: `The posting names Nigeria: "${included.sourceText}".`,
    };
  }

  const region = usable.find(
    (item) =>
      item.type === "explicitly_accepts_africa" ||
      item.type === "global_remote",
  );
  if (region) {
    return {
      verdict: "eligible",
      basis: `The posting names a region that contains Nigeria: "${region.sourceText}".`,
    };
  }

  const restricted = usable.find(
    (item) => item.type === "remote_with_country_restrictions",
  );
  if (restricted) {
    const names = restricted.countries ?? [];
    if (names.length > 0 && !names.includes(NIGERIA)) {
      return {
        verdict: "not_eligible",
        basis: `Remote, but restricted to ${names.join(", ")}.`,
      };
    }
  }

  return {
    verdict: "unclear",
    basis:
      "The posting mentions eligibility but the wording does not resolve to a country rule.",
  };
}

/**
 * Classify a location or eligibility string into evidence.
 *
 * Returns `eligibility_unclear` for anything that does not resolve — which is
 * the common case and the correct one. This function never returns
 * `explicitly_accepts_nigeria` from the word "remote".
 */
export function classifyEligibilityText(
  text: string,
  options: { sourceReceiptId?: string; observedAt?: string } = {},
): EligibilityEvidence {
  const base = {
    sourceText: text,
    sourceReceiptId: options.sourceReceiptId ?? null,
    observedAt: options.observedAt ?? null,
    reviewState: "unreviewed" as const,
  };
  const lower = text.toLowerCase();

  if (/\b(not|excluding|except)\b[^.]*\bnigeria\b/i.test(text)) {
    return {
      ...base,
      type: "explicitly_excludes_nigeria",
      inclusion: "exclude",
      countries: [NIGERIA],
      extractionMethod: "pattern",
      confidence: "high",
    };
  }

  if (/\bnigeria\b/i.test(text)) {
    return {
      ...base,
      type: "explicitly_accepts_nigeria",
      inclusion: "include",
      countries: [NIGERIA],
      extractionMethod: "pattern",
      confidence: "high",
    };
  }

  if (statesGlobalRemote(text)) {
    return {
      ...base,
      type: "global_remote",
      inclusion: "include",
      extractionMethod: "pattern",
      confidence: "medium",
    };
  }

  for (const region of REGIONS_INCLUDING_NIGERIA) {
    if (region === "anywhere") continue; // handled by statesGlobalRemote only
    if (new RegExp(`\\b${region}\\b`, "i").test(lower)) {
      return {
        ...base,
        type: "explicitly_accepts_africa",
        inclusion: "include",
        extractionMethod: "pattern",
        confidence: "medium",
      };
    }
  }

  // Everything else, including a bare "Remote", stays unresolved.
  return {
    ...base,
    type: "eligibility_unclear",
    inclusion: "neutral",
    extractionMethod: "pattern",
    confidence: isBareRemote(text) ? "high" : "low",
  };
}
