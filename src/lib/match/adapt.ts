import type { Job } from "@/lib/jobs/types";

import type {
  CandidateProfile,
  ExperienceLevel,
  JobFacts,
  PayPeriod,
  WorkArrangement,
} from "./types";

/**
 * The candidate profile as `api.get_my_candidate_profile` returns it. Declared
 * structurally rather than imported from the repository so this module stays
 * free of "server-only" and can be unit tested.
 */
export interface CandidateProfileRowLike {
  experience_level: string;
  desired_work_arrangement: string;
  desired_salary_min: number | null;
  desired_salary_max: number | null;
  desired_currency_code: string | null;
  desired_pay_period: string | null;
  location_country: string | null;
  open_to_relocation: boolean;
}

const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = [
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "executive",
  "unspecified",
];

const WORK_ARRANGEMENTS: readonly WorkArrangement[] = [
  "remote",
  "hybrid",
  "onsite",
  "unspecified",
];

const PAY_PERIODS: readonly PayPeriod[] = [
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "annual",
];

/**
 * The job feed and the candidate profile disagree on how they spell "we don't
 * know": the feed says "unknown"/"unclear", the database enum says
 * "unspecified". Both mean absent, and the scorer only understands the latter.
 */
function toExperienceLevel(value: string): ExperienceLevel {
  return EXPERIENCE_LEVELS.includes(value as ExperienceLevel)
    ? (value as ExperienceLevel)
    : "unspecified";
}

function toWorkArrangement(value: string): WorkArrangement {
  return WORK_ARRANGEMENTS.includes(value as WorkArrangement)
    ? (value as WorkArrangement)
    : "unspecified";
}

function toPayPeriod(value: string | null): PayPeriod | undefined {
  return value !== null && PAY_PERIODS.includes(value as PayPeriod)
    ? (value as PayPeriod)
    : undefined;
}

function positiveAmount(value: number | null): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export function toCandidateProfile(
  row: CandidateProfileRowLike,
): CandidateProfile {
  return {
    experienceLevel: toExperienceLevel(row.experience_level),
    desiredWorkArrangement: toWorkArrangement(row.desired_work_arrangement),
    desiredSalaryMin: positiveAmount(row.desired_salary_min),
    desiredSalaryMax: positiveAmount(row.desired_salary_max),
    desiredCurrencyCode: row.desired_currency_code ?? undefined,
    desiredPayPeriod: toPayPeriod(row.desired_pay_period),
    locationCountry: row.location_country ?? undefined,
    openToRelocation: row.open_to_relocation,
  };
}

export function toJobFacts(job: Job): JobFacts {
  const salary = job.salary;
  // A salary is only comparable when the source published a currency and a
  // period alongside the number. A bare figure is not a pay fact.
  const payPeriod = toPayPeriod(salary?.payPeriod ?? null);
  const currencyCode = salary?.currency ?? undefined;
  const comparablePay = Boolean(salary && currencyCode && payPeriod);

  return {
    experienceLevel: toExperienceLevel(job.experienceLevel),
    workArrangement: toWorkArrangement(job.workMode),
    salaryMin: comparablePay
      ? positiveAmount(salary?.minimum ?? null)
      : undefined,
    salaryMax: comparablePay
      ? positiveAmount(salary?.maximum ?? null)
      : undefined,
    currencyCode: comparablePay ? currencyCode : undefined,
    payPeriod: comparablePay ? payPeriod : undefined,
    eligibility: {
      worldwide: job.eligibility.scope === "worldwide",
      nigeria: job.eligibility.nigeria,
      includedCountries: job.eligibility.includedCountries,
      excludedCountries: job.eligibility.excludedCountries,
    },
  };
}
