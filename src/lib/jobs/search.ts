import { z } from "zod";

import { annualizedSalaryMinimum } from "./normalize";
import type { Job } from "./types";

const stringValue = z.preprocess(
  (value) => (Array.isArray(value) ? value[0] : value),
  z.string().trim().max(200).optional(),
);
const booleanValue = z.preprocess((value) => {
  const scalar = Array.isArray(value) ? value[0] : value;
  return scalar === "true" || scalar === "1" || scalar === "on";
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

export function parseJobSearch(input: Record<string, unknown>): JobSearch {
  const parsed = jobSearchSchema.safeParse(input);
  return parsed.success ? parsed.data : jobSearchSchema.parse({});
}

function includesValue(value: string, query: string) {
  return value.toLowerCase().includes(query.toLowerCase());
}

function relevanceScore(job: Job, search: JobSearch) {
  const query = search.q.toLowerCase();
  if (!query) return 0;
  let score = 0;
  if (job.title.toLowerCase().includes(query)) score += 8;
  if (job.company.name.toLowerCase().includes(query)) score += 5;
  if (job.skills.some((skill) => skill.toLowerCase().includes(query)))
    score += 4;
  if (job.category?.toLowerCase().includes(query)) score += 2;
  if (job.description.toLowerCase().includes(query)) score += 1;
  return score;
}

export function filterAndSortJobs(jobs: Job[], search: JobSearch): Job[] {
  const now = Date.now();
  const filtered = jobs.filter((job) => {
    if (job.status !== "open") return false;
    if (search.q && relevanceScore(job, search) === 0) return false;
    if (search.company && !includesValue(job.company.name, search.company))
      return false;
    if (search.location && !includesValue(job.locationDisplay, search.location))
      return false;
    if (search.workMode !== "all" && job.workMode !== search.workMode)
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
      if (now - Date.parse(job.postedAt) > days * 86_400_000) return false;
    }
    if (search.visaSponsorship && job.eligibility.visaSponsorship !== "yes")
      return false;
    if (search.relocationSupport && job.eligibility.relocationSupport !== "yes")
      return false;
    if (
      search.graduateTrainee &&
      !/graduate|trainee/i.test(`${job.title} ${job.description}`)
    )
      return false;
    if (search.internship && job.employmentType !== "internship") return false;
    if (search.nyscRequired && !/\bnysc\b/i.test(job.description)) return false;
    if (search.hndAccepted && !/\bhnd\b/i.test(job.description)) return false;
    if (
      search.bscRequired &&
      !/\b(?:bsc|b\.sc|bachelor)\b/i.test(job.description)
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
    return scoreDifference || Date.parse(b.postedAt) - Date.parse(a.postedAt);
  });
}

export function paginateJobs(jobs: Job[], page: number, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(jobs.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return {
    items: jobs.slice(start, start + pageSize),
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
    timezone: search.timezone || undefined,
    sort: search.sort !== "relevance" ? search.sort : undefined,
  };

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) parameters.set(key, String(value));
  }
  return parameters;
}
