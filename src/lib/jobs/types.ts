export type RemoteEligibilityScope =
  | "worldwide"
  | "africa"
  | "emea"
  | "nigeria"
  | "named_countries"
  | "restricted_region"
  | "unclear";

export type EligibilityDecision = "eligible" | "not_eligible" | "unclear";
export type EligibilityProvenance =
  "source_provided" | "manually_verified" | "inferred";

export type WorkMode = "remote" | "hybrid" | "onsite" | "unclear";
export type EmploymentType =
  | "full_time"
  | "part_time"
  | "contract"
  | "temporary"
  | "internship"
  | "freelance"
  | "unknown";
export type EmploymentArrangement =
  "employee" | "contractor" | "freelance" | "unknown";
export type ExperienceLevel =
  "entry" | "mid" | "senior" | "lead" | "executive" | "unknown";
export type PayPeriod =
  "hourly" | "daily" | "weekly" | "monthly" | "annual" | "unknown";

export interface JobSourcePolicy {
  id: string;
  name: string;
  type: "permitted_api" | "employer" | "partner" | "manual";
  termsUrl: string;
  termsReviewedAt: string;
  attributionRequired: string;
  canStoreFullDescription: boolean;
  canIndex: boolean;
  canUseJobPostingStructuredData: boolean;
  destinationRequirement: string;
  refreshIntervalSeconds: number;
}

export interface SalaryRange {
  originalText: string;
  currency: string | null;
  minimum: number | null;
  maximum: number | null;
  payPeriod: PayPeriod;
  grossNet: "gross" | "net" | "unknown";
}

export interface JobEligibility {
  scope: RemoteEligibilityScope;
  nigeria: EligibilityDecision;
  africa: EligibilityDecision;
  includedCountries: string[];
  excludedCountries: string[];
  requiredTimezone: string | null;
  workAuthorization: string | null;
  visaSponsorship: "yes" | "no" | "unclear";
  relocationSupport: "yes" | "no" | "unclear";
  evidenceText: string;
  provenance: EligibilityProvenance;
  lastVerifiedAt: string;
}

export interface RiskIndicator {
  code: string;
  label: string;
  explanation: string;
  severity: "info" | "caution" | "high";
}

export interface Job {
  id: string;
  databaseId: string | null;
  slug: string;
  externalId: string;
  source: JobSourcePolicy;
  sourceUrl: string;
  applicationUrl: string;
  title: string;
  company: {
    name: string;
    slug: string;
    verification: "source_listed" | "employer_verified" | "unverified";
  };
  locationDisplay: string;
  workMode: WorkMode;
  employmentType: EmploymentType;
  arrangement: EmploymentArrangement;
  experienceLevel: ExperienceLevel;
  category: string | null;
  skills: string[];
  salary: SalaryRange | null;
  eligibility: JobEligibility;
  description: string;
  requirements: string | null;
  benefits: string | null;
  postedAt: string;
  lastCheckedAt: string;
  validThrough: string | null;
  status: "open" | "expired";
  riskIndicators: RiskIndicator[];
  fingerprint: string;
}

export interface JobFeedResult {
  jobs: Job[];
  state: "live" | "degraded" | "disabled" | "unavailable";
  checkedAt: string;
  message?: string;
  sources: JobFeedSourceStatus[];
}

export interface JobFeedSourceStatus {
  key: "remotive" | "database";
  state: "live" | "degraded" | "disabled" | "unavailable";
  checkedAt: string;
  count: number;
  code?: string;
  message?: string;
}
