/**
 * Canonical employer identity resolution.
 *
 * An employer arrives under a different name from every system that touches
 * it. Resolution walks an evidence ladder and stops at the first rung that
 * actually proves identity; fuzzy name similarity is the bottom rung and it
 * never decides anything on its own.
 *
 * The caution is not theoretical. Probing this repository's own candidates
 * found Greenhouse tenant `carbon` belonging to an unrelated US company (not
 * Nigeria's Carbon), `branch` belonging to US Branch Metrics (not Branch
 * International), and a third-party dataset returning an Australian real
 * estate agency for "Andela". A name is not an identity.
 */

export type EmployerEvidenceKind =
  | "ats_tenant"
  | "verified_domain"
  | "exact_alias"
  | "legal_entity"
  | "fuzzy_name";

/** Confidence a rung of the ladder carries, highest first. */
const EVIDENCE_RANK: Record<EmployerEvidenceKind, number> = {
  ats_tenant: 1,
  verified_domain: 2,
  legal_entity: 3,
  exact_alias: 4,
  fuzzy_name: 5,
};

export interface EmployerCandidate {
  companyId: string;
  displayName: string;
  /** Registered ATS tenants, e.g. greenhouse:moniepoint. */
  atsTenants?: readonly string[];
  /** Verified corporate and careers domains. */
  domains?: readonly string[];
  aliases?: readonly string[];
  legalEntityNames?: readonly string[];
  /** The parent this company rolls up to, when it is a subsidiary. */
  parentCompanyId?: string | null;
}

export interface EmployerObservation {
  /** Provider and tenant the record came from, e.g. greenhouse:moniepoint. */
  atsTenant?: string | null;
  /** Host of the application destination. */
  destinationHost?: string | null;
  /** The employer name exactly as the source wrote it. */
  rawName: string;
}

export type EmployerResolution =
  | {
      state: "resolved";
      companyId: string;
      evidence: EmployerEvidenceKind;
      reason: string;
    }
  | {
      state: "review";
      candidates: readonly {
        companyId: string;
        displayName: string;
        score: number;
      }[];
      reason: string;
    }
  | { state: "unresolved"; reason: string };

function normalizeName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[.,]/g, "")
      // Suffixes that distinguish legal entities are removed for *candidate
      // generation only*. They are never removed when comparing legal entities,
      // because "X Group" and "X Bank" are different companies.
      .replace(
        /\b(ltd|limited|plc|inc|incorporated|llc|gmbh|bv|nv|sa|pte|co)\b/g,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim()
  );
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

function hostMatches(host: string, domain: string): boolean {
  const h = normalizeHost(host);
  const d = normalizeHost(domain);
  return h === d || h.endsWith(`.${d}`);
}

/**
 * Token-overlap similarity in [0,1]. Deliberately simple: this feeds a review
 * queue, so a sophisticated scorer would only lend false authority to a
 * number that a human still has to check.
 */
export function nameSimilarity(a: string, b: string): number {
  const left = new Set(normalizeName(a).split(" ").filter(Boolean));
  const right = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  return shared / Math.max(left.size, right.size);
}

/**
 * Similarity at or above this generates a review candidate.
 *
 * Set deliberately low. The two errors here are not symmetric: a spurious
 * candidate costs a reviewer a few seconds, while a missed one leaves two
 * records for one employer and splits its salary cells, reviews and jobs in
 * two. Since fuzzy matching can only ever *propose*, recall is worth more
 * than precision — "Moniepoint Payments" against "Moniepoint" scores 0.5 and
 * is exactly the kind of pair a human should see.
 */
export const FUZZY_CANDIDATE_THRESHOLD = 0.5;

export function resolveEmployer(
  observation: EmployerObservation,
  candidates: readonly EmployerCandidate[],
): EmployerResolution {
  // 1. ATS tenant. The employer controls the board, so this is the strongest
  //    evidence available and it outranks everything below it.
  if (observation.atsTenant) {
    const tenant = observation.atsTenant.toLowerCase();
    const match = candidates.find((candidate) =>
      candidate.atsTenants?.some((value) => value.toLowerCase() === tenant),
    );
    if (match) {
      return {
        state: "resolved",
        companyId: match.companyId,
        evidence: "ats_tenant",
        reason: `Registered ATS tenant ${observation.atsTenant}.`,
      };
    }
  }

  // 2. Verified domain, but only when exactly one company claims the host.
  //    A host claimed by several companies proves nothing on its own.
  if (observation.destinationHost) {
    const host = observation.destinationHost;
    const matches = candidates.filter((candidate) =>
      candidate.domains?.some((domain) => hostMatches(host, domain)),
    );
    const [onlyDomainMatch] = matches;
    if (matches.length === 1 && onlyDomainMatch) {
      return {
        state: "resolved",
        companyId: onlyDomainMatch.companyId,
        evidence: "verified_domain",
        reason: `${host} is a verified domain of ${onlyDomainMatch.displayName}.`,
      };
    }
    if (matches.length > 1) {
      return {
        state: "review",
        candidates: matches.map((candidate) => ({
          companyId: candidate.companyId,
          displayName: candidate.displayName,
          score: 1,
        })),
        reason: `${host} is claimed by ${matches.length} companies.`,
      };
    }
  }

  const normalizedRaw = normalizeName(observation.rawName);

  // 3. Exact legal-entity name. Compared unnormalised for suffixes, because
  //    the suffix is precisely what separates a group from its licensed
  //    subsidiary.
  const legalMatches = candidates.filter((candidate) =>
    candidate.legalEntityNames?.some(
      (name) =>
        name.toLowerCase().trim() === observation.rawName.toLowerCase().trim(),
    ),
  );
  const [onlyLegalMatch] = legalMatches;
  if (legalMatches.length === 1 && onlyLegalMatch) {
    return {
      state: "resolved",
      companyId: onlyLegalMatch.companyId,
      evidence: "legal_entity",
      reason: `Exact legal entity name match.`,
    };
  }

  // 4. Exact alias match.
  const aliasMatches = candidates.filter(
    (candidate) =>
      normalizeName(candidate.displayName) === normalizedRaw ||
      candidate.aliases?.some(
        (alias) => normalizeName(alias) === normalizedRaw,
      ),
  );
  const [onlyAliasMatch] = aliasMatches;
  if (aliasMatches.length === 1 && onlyAliasMatch) {
    return {
      state: "resolved",
      companyId: onlyAliasMatch.companyId,
      evidence: "exact_alias",
      reason: `Exact name or alias match.`,
    };
  }
  if (aliasMatches.length > 1) {
    return {
      state: "review",
      candidates: aliasMatches.map((candidate) => ({
        companyId: candidate.companyId,
        displayName: candidate.displayName,
        score: 1,
      })),
      reason: `"${observation.rawName}" matches ${aliasMatches.length} companies exactly.`,
    };
  }

  // 5. Fuzzy. Generates candidates for a human; never resolves.
  const scored = candidates
    .map((candidate) => ({
      companyId: candidate.companyId,
      displayName: candidate.displayName,
      score: nameSimilarity(observation.rawName, candidate.displayName),
    }))
    .filter((candidate) => candidate.score >= FUZZY_CANDIDATE_THRESHOLD)
    .toSorted((a, b) => b.score - a.score);

  if (scored.length > 0) {
    return {
      state: "review",
      candidates: scored,
      reason:
        "Name similarity only. Fuzzy matches generate review candidates and never merge on their own.",
    };
  }

  return {
    state: "unresolved",
    reason: `No deterministic evidence identifies "${observation.rawName}".`,
  };
}

export interface MergeAssessment {
  allowed: boolean;
  requiresReview: boolean;
  reason: string;
}

/**
 * Whether two employer records may be merged.
 *
 * A merge moves salary cells, reviews and interview reports, so it is close
 * to irreversible in its effects. Parent/subsidiary pairs are refused
 * outright rather than queued: merging them would let a licence held by one
 * entity appear to cover another, which is a false claim about a regulated
 * business.
 */
export function assessMerge(
  left: EmployerCandidate,
  right: EmployerCandidate,
  evidence: EmployerEvidenceKind,
): MergeAssessment {
  if (
    left.parentCompanyId === right.companyId ||
    right.parentCompanyId === left.companyId
  ) {
    return {
      allowed: false,
      requiresReview: false,
      reason:
        "Parent and subsidiary are distinct legal entities; merging would transfer regulator claims between them.",
    };
  }

  const sharedDomain = left.domains?.some((domain) =>
    right.domains?.some(
      (other) => normalizeHost(domain) === normalizeHost(other),
    ),
  );
  const sharedTenant = left.atsTenants?.some((tenant) =>
    right.atsTenants?.some(
      (other) => tenant.toLowerCase() === other.toLowerCase(),
    ),
  );

  if (sharedTenant || sharedDomain) {
    return {
      allowed: true,
      requiresReview: false,
      reason: sharedTenant
        ? "Both records claim the same ATS tenant."
        : "Both records claim the same verified domain.",
    };
  }

  if (EVIDENCE_RANK[evidence] >= EVIDENCE_RANK.fuzzy_name) {
    return {
      allowed: false,
      requiresReview: true,
      reason: "Name similarity alone never merges two employers.",
    };
  }

  return {
    allowed: false,
    requiresReview: true,
    reason: "Deterministic evidence is not shared; a reviewer must decide.",
  };
}
