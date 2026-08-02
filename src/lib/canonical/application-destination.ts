/**
 * Application destination classification and preference.
 *
 * A canonical job may be described by several sources, each offering its own
 * apply link. The rule is that a candidate should reach the employer by the
 * shortest verified path: if a direct employer or employer-ATS destination
 * exists, routing them through an aggregator adds a hop, a tracking layer and
 * another chance for the link to rot, for no benefit to them.
 *
 * Classification is deterministic. It reads the destination host against the
 * employer's known domains and a fixed table of ATS and aggregator hosts —
 * never a guess from the job title or the source's self-description.
 */

export const DESTINATION_KINDS = [
  "direct_employer",
  "employer_ats",
  "agency",
  "email",
  "external_board",
  "aggregator",
] as const;

export type DestinationKind = (typeof DESTINATION_KINDS)[number];

/**
 * Preference order, lowest number wins. This mirrors the authority order
 * already enforced on `ingest.job_occurrence_links` for choosing which source
 * describes a job, so a job's winning source and its winning destination
 * cannot disagree about who is closest to the employer.
 */
const DESTINATION_RANK: Record<DestinationKind, number> = {
  direct_employer: 1,
  employer_ats: 2,
  agency: 3,
  email: 4,
  external_board: 5,
  aggregator: 6,
};

/** Hosts that are an employer's own applicant tracking system. */
const ATS_HOSTS = [
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "job-boards.eu.greenhouse.io",
  "boards.eu.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "apply.workable.com",
  "jobs.smartrecruiters.com",
  "myworkdayjobs.com",
  "icims.com",
  "bamboohr.com",
  "breezy.hr",
  "recruitee.com",
  "teamtailor.com",
  "personio.de",
  "join.com",
] as const;

/** Hosts that re-list other people's roles rather than hiring themselves. */
const AGGREGATOR_HOSTS = [
  "indeed.com",
  "linkedin.com",
  "glassdoor.com",
  "ziprecruiter.com",
  "simplyhired.com",
  "adzuna.com",
  "jooble.org",
  "neuvoo.com",
  "talent.com",
  "learn4good.com",
] as const;

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function hostMatches(host: string, candidate: string): boolean {
  return host === candidate || host.endsWith(`.${candidate}`);
}

export interface DestinationClassification {
  kind: DestinationKind;
  host: string | null;
  /** True when the classification rests on evidence rather than a fallback. */
  deterministic: boolean;
  reason: string;
}

/**
 * Classify a destination URL.
 *
 * `employerDomains` are the employer's verified corporate and careers domains
 * from `app.company_domains`. They are checked first: an employer's own domain
 * is the strongest possible evidence, and it outranks the ATS table because a
 * company hosting its board at `careers.example.com` is still the employer.
 */
export function classifyDestination(
  url: string,
  employerDomains: readonly string[] = [],
): DestinationClassification {
  if (url.startsWith("mailto:")) {
    return {
      kind: "email",
      host: null,
      deterministic: true,
      reason: "Applications are collected by email.",
    };
  }

  const host = hostOf(url);
  if (!host) {
    // An unparseable URL is not evidence of anything. It is reported as an
    // external board so it never wins the preferred-destination comparison.
    return {
      kind: "external_board",
      host: null,
      deterministic: false,
      reason: "The destination could not be parsed as a URL.",
    };
  }

  for (const domain of employerDomains) {
    const normalized = domain.toLowerCase().replace(/^www\./, "");
    if (normalized && hostMatches(host, normalized)) {
      return {
        kind: "direct_employer",
        host,
        deterministic: true,
        reason: `${host} is a verified domain of the employer.`,
      };
    }
  }

  for (const ats of ATS_HOSTS) {
    if (hostMatches(host, ats)) {
      return {
        kind: "employer_ats",
        host,
        deterministic: true,
        reason: `${host} is an applicant tracking system the employer controls.`,
      };
    }
  }

  for (const aggregator of AGGREGATOR_HOSTS) {
    if (hostMatches(host, aggregator)) {
      return {
        kind: "aggregator",
        host,
        deterministic: true,
        reason: `${host} re-lists roles published elsewhere.`,
      };
    }
  }

  return {
    kind: "external_board",
    host,
    deterministic: false,
    reason: `${host} is not a known employer domain, ATS or aggregator.`,
  };
}

export function destinationRank(kind: DestinationKind): number {
  return DESTINATION_RANK[kind];
}

export interface DestinationCandidate {
  url: string;
  kind: DestinationKind;
  /** Health from the apply-link checker; broken links cannot be preferred. */
  linkState?: "unchecked" | "healthy" | "broken" | "indeterminate";
}

/**
 * Choose the destination a candidate should be sent to.
 *
 * A broken link never wins, however close to the employer it is: sending
 * someone to a dead employer page is worse than sending them to a working
 * aggregator listing. When every candidate is broken the function returns
 * null rather than picking a least-bad option, because the caller must then
 * stop showing an apply action rather than quietly offering a dead one.
 */
export function preferredDestination(
  candidates: readonly DestinationCandidate[],
): DestinationCandidate | null {
  const usable = candidates.filter(
    (candidate) => candidate.linkState !== "broken",
  );
  if (usable.length === 0) return null;
  const [best] = usable.toSorted((a, b) => {
    const rank = destinationRank(a.kind) - destinationRank(b.kind);
    if (rank !== 0) return rank;
    // A checked-healthy link beats an unchecked one of the same kind.
    const health = (candidate: DestinationCandidate) =>
      candidate.linkState === "healthy" ? 0 : 1;
    return health(a) - health(b);
  });
  return best ?? null;
}
