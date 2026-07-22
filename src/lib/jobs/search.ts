import { z } from "zod";

import { annualizedSalaryMinimum } from "./normalize";
import { hasJobEvidence, type AfricaEvidenceKey } from "./evidence";
import { isJobCurrentlyPublishable } from "./publication";
import { expandJobSearchQuery } from "./search-synonyms";
import type { Job } from "./types";

const stringValue = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.string().trim().max(200).optional(),
);
const booleanValue = z.preprocess((value) => {
  const scalar = Array.isArray(value) ? value[0] : value;
  if (typeof scalar === "boolean") return scalar;
  return scalar === "true" || scalar === "1" || scalar === 1 || scalar === "on";
}, z.boolean());

export const jobSearchSchema = z.object({
  q: stringValue.default(""),
  company: stringValue.default(""),
  location: stringValue.default(""),
  workMode: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.enum(["remote", "hybrid", "onsite", "all"]).default("all"),
  ),
  eligibility: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.enum(["nigeria", "africa", "worldwide", "unclear", "all"]).default("all"),
  ),
  path: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z
      .enum(["local_nigeria", "remote_nigeria", "remote_africa", "all"])
      .default("all"),
  ),
  employmentType: stringValue.default("all"),
  arrangement: stringValue.default("all"),
  experience: stringValue.default("all"),
  category: stringValue.default("all"),
  postedWithin: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.enum(["1", "3", "7", "14", "30", "all"]).default("all"),
  ),
  salaryDisclosed: booleanValue.default(false),
  currency: stringValue.default("all"),
  minSalary: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.coerce.number().nonnegative().max(1_000_000_000).optional(),
  ),
  visaSponsorship: booleanValue.default(false),
  relocationSupport: booleanValue.default(false),
  graduateTrainee: booleanValue.default(false),
  internship: booleanValue.default(false),
  nyscRequired: booleanValue.default(false),
  hndAccepted: booleanValue.default(false),
  bscRequired: booleanValue.default(false),
  professionalCertification: booleanValue.default(false),
  localLanguage: booleanValue.default(false),
  pension: booleanValue.default(false),
  hmo: booleanValue.default(false),
  transport: booleanValue.default(false),
  housing: booleanValue.default(false),
  dataPowerAllowance: booleanValue.default(false),
  thirteenthMonth: booleanValue.default(false),
  bonus: booleanValue.default(false),
  overtimeWeekend: booleanValue.default(false),
  fxPolicy: booleanValue.default(false),
  payReliability: booleanValue.default(false),
  timezone: stringValue.default(""),
  sort: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.enum(["relevance", "newest", "salary"]).default("relevance"),
  ),
  page: z.preprocess(
    (value) => (Array.isArray(value) ? value[0] : value),
    z.coerce.number().int().min(1).max(500).default(1),
  ),
});

export type JobSearch = z.infer<typeof jobSearchSchema>;

function decodeCanonicalJobSearch(value: Record<string, unknown>) {
  const parsed = jobSearchSchema.strict().safeParse(value);
  if (!parsed.success) return null;
  for (const [key, rawValue] of Object.entries(value)) {
    if (!Object.is(rawValue, parsed.data[key as keyof JobSearch])) return null;
  }
  return parsed.data;
}

export const jobAlertDraftSearchSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    if (!decodeCanonicalJobSearch(value)) {
      context.addIssue({
        code: "custom",
        message: "Alert search contains non-canonical or unknown fields.",
      });
    }
  })
  .transform((value) => decodeCanonicalJobSearch(value)!);

export const jobAlertSearchSpecSchema = z
  .record(z.string(), z.unknown())
  .superRefine((value, context) => {
    if (value.schema_version !== 1) {
      context.addIssue({
        code: "custom",
        path: ["schema_version"],
        message: "Unsupported alert search schema version.",
      });
      return;
    }

    const searchInput = { ...value };
    delete searchInput.schema_version;
    if (!decodeCanonicalJobSearch(searchInput)) {
      context.addIssue({
        code: "custom",
        message: "Alert search contains non-canonical or unknown fields.",
      });
    }
  })
  .transform((value) => {
    const searchInput = { ...value };
    delete searchInput.schema_version;
    return {
      ...decodeCanonicalJobSearch(searchInput)!,
      schema_version: 1 as const,
    };
  });

export function parseStoredJobAlertSearch(value: string | undefined) {
  if (!value) return jobAlertDraftSearchSchema.parse({});
  try {
    const parsed: unknown = JSON.parse(value);
    const result = jobAlertDraftSearchSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function parseJobSearch(input: Record<string, unknown>): JobSearch {
  const parsed = jobSearchSchema.safeParse(input);
  if (parsed.success) return parsed.data;
  // Drop only the offending params so one stale or hand-edited value cannot
  // silently clear every other filter the user set.
  const sanitized = { ...input };
  for (const issue of parsed.error.issues) {
    const key = issue.path[0];
    if (typeof key === "string") delete sanitized[key];
  }
  const retry = jobSearchSchema.safeParse(sanitized);
  return retry.success ? retry.data : jobSearchSchema.parse({});
}

function includesValue(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function directRelevanceScore(job: Job, query: string) {
  let score = 0;
  if (job.title.toLowerCase().includes(query)) score += 8;
  if (job.company.name.toLowerCase().includes(query)) score += 5;
  if (job.skills.some((skill) => skill.toLowerCase().includes(query)))
    score += 4;
  if (job.category?.toLowerCase().includes(query)) score += 2;
  if (job.description.toLowerCase().includes(query)) score += 1;
  return score;
}

/**
 * A synonym match ranks below the same match on the literal query and never
 * matches on the company name: a role vocabulary maps between role words,
 * not between employers.
 */
function synonymRelevanceScore(job: Job, phrase: string) {
  let score = 0;
  if (job.title.toLowerCase().includes(phrase)) score += 6;
  if (job.skills.some((skill) => skill.toLowerCase().includes(phrase)))
    score += 3;
  if (job.category?.toLowerCase().includes(phrase)) score += 2;
  if (job.description.toLowerCase().includes(phrase)) score += 1;
  return score;
}

function relevanceScore(job: Job, search: JobSearch) {
  const query = search.q.toLowerCase();
  if (!query) return 0;
  const direct = directRelevanceScore(job, query);
  let best = direct;
  for (const phrase of expandJobSearchQuery(query)) {
    const score = synonymRelevanceScore(job, phrase);
    if (score > best) best = score;
  }
  return best;
}

/**
 * How directly a role serves the core audience: Nigeria-local work first,
 * then remote roles with explicit Nigeria eligibility, then explicit Africa
 * eligibility. Used as the default browse order so verified local supply is
 * not buried under whichever remote feed refreshed last.
 */
function nigeriaValueTier(job: Job) {
  if (job.workMode !== "remote" && /\bnigeria\b/i.test(job.locationDisplay)) {
    return 3;
  }
  if (job.workMode === "remote" && job.eligibility.nigeria === "eligible") {
    return 2;
  }
  if (job.workMode === "remote" && job.eligibility.africa === "eligible") {
    return 1;
  }
  return 0;
}

export function filterAndSortJobs(
  jobs: Job[],
  search: JobSearch,
  now = new Date(),
): Job[] {
  const nowValue = now.valueOf();
  const filtered = jobs.filter((job) => {
    if (!isJobCurrentlyPublishable(job, now)) return false;
    if (search.q && relevanceScore(job, search) === 0) return false;
    if (search.company && !includesValue(job.company.name, search.company))
      return false;
    if (search.location && !includesValue(job.locationDisplay, search.location))
      return false;
    if (search.workMode !== "all" && job.workMode !== search.workMode)
      return false;
    if (
      search.path === "local_nigeria" &&
      (job.workMode === "remote" ||
        !includesValue(job.locationDisplay, "nigeria"))
    )
      return false;
    if (
      search.path === "remote_nigeria" &&
      (job.workMode !== "remote" || job.eligibility.nigeria !== "eligible")
    )
      return false;
    if (
      search.path === "remote_africa" &&
      (job.workMode !== "remote" || job.eligibility.africa !== "eligible")
    )
      return false;
    if (
      search.eligibility === "nigeria" &&
      job.eligibility.nigeria !== "eligible"
    )
      return false;
    if (
      search.eligibility === "africa" &&
      job.eligibility.africa !== "eligible"
    )
      return false;
    if (
      search.eligibility === "worldwide" &&
      job.eligibility.scope !== "worldwide"
    )
      return false;
    if (
      search.eligibility === "unclear" &&
      job.eligibility.nigeria !== "unclear"
    )
      return false;
    if (
      search.employmentType !== "all" &&
      job.employmentType !== search.employmentType
    )
      return false;
    if (search.arrangement !== "all" && job.arrangement !== search.arrangement)
      return false;
    if (
      search.experience !== "all" &&
      job.experienceLevel !== search.experience
    )
      return false;
    if (search.category !== "all" && job.category !== search.category)
      return false;
    if (search.salaryDisclosed && !job.salary) return false;
    if (search.currency !== "all" && job.salary?.currency !== search.currency)
      return false;
    if (search.minSalary !== undefined) {
      const annualMinimum = annualizedSalaryMinimum(job);
      if (annualMinimum === null || annualMinimum < search.minSalary)
        return false;
    }
    if (search.postedWithin !== "all") {
      const days = Number(search.postedWithin);
      if (nowValue - Date.parse(job.postedAt) > days * 86_400_000) return false;
    }
    if (search.visaSponsorship && job.eligibility.visaSponsorship !== "yes")
      return false;
    if (search.relocationSupport && job.eligibility.relocationSupport !== "yes")
      return false;
    const evidenceFilters: Array<[boolean, AfricaEvidenceKey]> = [
      [search.graduateTrainee, "graduateTrainee"],
      [search.internship, "internship"],
      [search.nyscRequired, "nyscRequired"],
      [search.hndAccepted, "hndAccepted"],
      [search.bscRequired, "bscRequired"],
      [search.professionalCertification, "professionalCertification"],
      [search.localLanguage, "localLanguage"],
      [search.pension, "pension"],
      [search.hmo, "hmo"],
      [search.transport, "transport"],
      [search.housing, "housing"],
      [search.dataPowerAllowance, "dataPowerAllowance"],
      [search.thirteenthMonth, "thirteenthMonth"],
      [search.bonus, "bonus"],
      [search.overtimeWeekend, "overtimeWeekend"],
      [search.fxPolicy, "fxPolicy"],
      [search.payReliability, "payReliability"],
    ];
    if (
      evidenceFilters.some(
        ([enabled, key]) => enabled && !hasJobEvidence(job, key),
      )
    )
      return false;
    if (
      search.timezone &&
      !includesValue(
        job.eligibility.requiredTimezone ?? job.description,
        search.timezone,
      )
    )
      return false;
    return true;
  });

  return filtered.toSorted((a, b) => {
    if (search.sort === "newest")
      return Date.parse(b.postedAt) - Date.parse(a.postedAt);
    if (search.sort === "salary")
      return (
        (annualizedSalaryMinimum(b) ?? -1) - (annualizedSalaryMinimum(a) ?? -1)
      );
    const scoreDifference =
      relevanceScore(b, search) - relevanceScore(a, search);
    return (
      scoreDifference ||
      nigeriaValueTier(b) - nigeriaValueTier(a) ||
      Date.parse(b.postedAt) - Date.parse(a.postedAt)
    );
  });
}

function locationCluster(job: Job) {
  return (
    job.locationDisplay
      .toLowerCase()
      .replace(/\b(?:remote|hybrid|onsite|on-site)\b/g, "")
      .split(/[;,|/]/)[0]
      ?.replace(/[^a-z0-9]+/g, " ")
      .trim() || "unstated"
  );
}

/**
 * Reorders a sorted result set without dropping jobs. Earlier source order is
 * retained as the tie-breaker, while repeated employers and location variants
 * receive a soft penalty so the first page exposes more genuine choice.
 */
export function diversifyJobResults(jobs: Job[]) {
  const remaining = jobs.map((job, index) => ({ job, index }));
  const selected: Job[] = [];
  const companyCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]!;
      const companyKey =
        candidate.job.company.slug || candidate.job.company.name;
      const locationKey = locationCluster(candidate.job);
      const score =
        (companyCounts.get(companyKey) ?? 0) * 10_000 +
        (locationCounts.get(locationKey) ?? 0) * 2_000 +
        candidate.index;
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const job = remaining.splice(bestIndex, 1)[0]!.job;
    selected.push(job);
    const companyKey = job.company.slug || job.company.name;
    const locationKey = locationCluster(job);
    companyCounts.set(companyKey, (companyCounts.get(companyKey) ?? 0) + 1);
    locationCounts.set(locationKey, (locationCounts.get(locationKey) ?? 0) + 1);
  }

  return selected;
}

export function paginateJobs(jobs: Job[], page: number, pageSize = 10) {
  const safePageSize =
    Number.isInteger(pageSize) && pageSize > 0 ? Math.min(pageSize, 100) : 10;
  const totalPages = Math.max(1, Math.ceil(jobs.length / safePageSize));
  const requestedPage = Number.isInteger(page) && page > 0 ? page : 1;
  const safePage = Math.min(requestedPage, totalPages);
  const start = (safePage - 1) * safePageSize;
  return {
    items: jobs.slice(start, start + safePageSize),
    page: safePage,
    totalPages,
    totalItems: jobs.length,
  };
}

export function serializeJobSearch(search: JobSearch) {
  const parameters = new URLSearchParams();
  const values: Record<string, string | number | boolean | undefined> = {
    q: search.q || undefined,
    company: search.company || undefined,
    location: search.location || undefined,
    workMode: search.workMode !== "all" ? search.workMode : undefined,
    eligibility: search.eligibility !== "all" ? search.eligibility : undefined,
    path: search.path !== "all" ? search.path : undefined,
    employmentType:
      search.employmentType !== "all" ? search.employmentType : undefined,
    arrangement: search.arrangement !== "all" ? search.arrangement : undefined,
    experience: search.experience !== "all" ? search.experience : undefined,
    category: search.category !== "all" ? search.category : undefined,
    postedWithin:
      search.postedWithin !== "all" ? search.postedWithin : undefined,
    salaryDisclosed: search.salaryDisclosed || undefined,
    currency: search.currency !== "all" ? search.currency : undefined,
    minSalary: search.minSalary,
    visaSponsorship: search.visaSponsorship || undefined,
    relocationSupport: search.relocationSupport || undefined,
    graduateTrainee: search.graduateTrainee || undefined,
    internship: search.internship || undefined,
    nyscRequired: search.nyscRequired || undefined,
    hndAccepted: search.hndAccepted || undefined,
    bscRequired: search.bscRequired || undefined,
    professionalCertification: search.professionalCertification || undefined,
    localLanguage: search.localLanguage || undefined,
    pension: search.pension || undefined,
    hmo: search.hmo || undefined,
    transport: search.transport || undefined,
    housing: search.housing || undefined,
    dataPowerAllowance: search.dataPowerAllowance || undefined,
    thirteenthMonth: search.thirteenthMonth || undefined,
    bonus: search.bonus || undefined,
    overtimeWeekend: search.overtimeWeekend || undefined,
    fxPolicy: search.fxPolicy || undefined,
    payReliability: search.payReliability || undefined,
    timezone: search.timezone || undefined,
    sort: search.sort !== "relevance" ? search.sort : undefined,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  return parameters;
}
