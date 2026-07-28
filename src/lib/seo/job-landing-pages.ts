import type { Job } from "@/lib/jobs/types";
import { isJobCurrentlyPublishable } from "@/lib/jobs/publication";

export type JobLandingKey =
  | "remote_nigeria"
  | "nigeria_local"
  | "nigeria_graduate"
  | "visa_sponsorship_nigeria"
  | "nigeria_software"
  | "nigeria_ngo"
  | "role_software_engineering"
  | "city_lagos";

export interface JobLandingDefinition {
  key: JobLandingKey;
  path: string;
  title: string;
  description: string;
  heading: string;
  intent: string;
  relatedPaths: string[];
}

export interface JobLandingMetrics {
  key: JobLandingKey;
  activeUniqueJobs: number;
  uniqueJobsSeen90Days: number;
  companyCount: number;
  stableDemandSignal: boolean;
  lastModified: string | null;
  measuredAt: string;
}

export interface JobLandingIndexDecision {
  indexable: boolean;
  reasons: string[];
  summary: string;
}

export const JOB_LANDING_DEFINITIONS: readonly JobLandingDefinition[] = [
  {
    key: "remote_nigeria",
    path: "/jobs/remote",
    title: "Remote jobs open to Nigerians",
    description:
      "Remote roles that state in writing whether people in Nigeria can apply. Every listing names its source and shows when it was last checked.",
    heading: "Remote jobs with Nigeria eligibility evidence",
    intent: "remote roles that explicitly include Nigerian applicants",
    relatedPaths: [
      "/jobs",
      "/jobs/nigeria",
      "/jobs/visa-sponsorship",
      "/jobs/ngo",
    ],
  },
  {
    key: "nigeria_local",
    path: "/jobs/nigeria",
    title: "Jobs in Nigeria",
    description:
      "Onsite and hybrid roles with a work location stated in Nigeria. Every listing names the source it came from and shows when it was last checked.",
    heading: "Local jobs in Nigeria",
    intent: "onsite and hybrid jobs physically located in Nigeria",
    relatedPaths: [
      "/jobs",
      "/jobs/graduate",
      "/jobs/software",
      "/jobs/cities/lagos",
    ],
  },
  {
    key: "nigeria_graduate",
    path: "/jobs/graduate",
    title: "Graduate and NYSC jobs in Nigeria",
    description:
      "Graduate trainee, entry-level, internship and NYSC-linked roles in Nigeria. Every listing names its source and shows when it was last checked.",
    heading: "Graduate and NYSC opportunities",
    intent: "graduate trainee, internship, entry-level or NYSC-linked roles",
    relatedPaths: ["/jobs/nigeria", "/jobs/software", "/methodology"],
  },
  {
    key: "visa_sponsorship_nigeria",
    path: "/jobs/visa-sponsorship",
    title: "Visa-sponsored jobs open to Nigerians",
    description:
      "Roles that state visa sponsorship in writing and include Nigeria in who may apply. Every listing names its source and shows its last check date.",
    heading: "Visa-sponsored roles with Nigeria eligibility",
    intent:
      "roles with explicit visa-sponsorship and Nigeria eligibility evidence",
    relatedPaths: ["/jobs/remote", "/jobs", "/methodology"],
  },
  {
    key: "nigeria_software",
    path: "/jobs/software",
    title: "Software jobs open to Nigerians",
    description:
      "Software roles located in Nigeria or explicitly open to Nigerian applicants. Every listing names its source and shows when it was last checked.",
    heading: "Nigeria-eligible software jobs",
    intent: "software roles located in Nigeria or explicitly open to Nigerians",
    relatedPaths: [
      "/jobs/remote",
      "/jobs/graduate",
      "/jobs/roles/software-engineering",
      "/companies",
    ],
  },
  {
    key: "nigeria_ngo",
    path: "/jobs/ngo",
    title: "NGO jobs in Nigeria",
    description:
      "Nonprofit and humanitarian roles located in Nigeria or open to Nigerian applicants. Every listing names its source and shows its last check date.",
    heading: "NGO and humanitarian jobs in Nigeria",
    intent:
      "NGO, nonprofit and humanitarian roles relevant to Nigerian applicants",
    relatedPaths: ["/jobs/nigeria", "/jobs/remote", "/companies"],
  },
  {
    key: "role_software_engineering",
    path: "/jobs/roles/software-engineering",
    title: "Software engineering jobs open to Nigerians",
    description:
      "Software engineering roles located in Nigeria or explicitly open to Nigerian applicants. Every listing names its source and its last check date.",
    heading: "Software engineering jobs for Nigerians",
    intent:
      "software engineering roles with Nigerian location or eligibility evidence",
    relatedPaths: ["/jobs/software", "/jobs/remote", "/salaries"],
  },
  {
    key: "city_lagos",
    path: "/jobs/cities/lagos",
    title: "Jobs in Lagos",
    description:
      "Onsite and hybrid roles that name Lagos as the workplace. Every listing names the source it came from and shows when it was last checked.",
    heading: "Current jobs in Lagos",
    intent: "onsite and hybrid roles with Lagos as the stated work location",
    relatedPaths: ["/jobs/nigeria", "/jobs/graduate", "/companies"],
  },
] as const;

const byKey = new Map(
  JOB_LANDING_DEFINITIONS.map((definition) => [definition.key, definition]),
);
const byPath = new Map(
  JOB_LANDING_DEFINITIONS.map((definition) => [definition.path, definition]),
);

export function getJobLandingDefinition(key: JobLandingKey) {
  return byKey.get(key) ?? null;
}

export function getJobLandingDefinitionByPath(path: string) {
  return byPath.get(path) ?? null;
}

/**
 * Labels for the hub pages a landing page links to that are not themselves
 * landing pages. Everything else resolves to its landing definition title.
 */
const RELATED_HUB_LABELS: Record<string, string> = {
  "/jobs": "Search all jobs",
  "/companies": "Browse companies",
  "/salaries": "Salary information",
  "/methodology": "How evidence works",
};

/**
 * Anchor text for a related-path link.
 *
 * Deriving this from the slug produced strings like "jobs visa-sponsorship",
 * which reads as raw routing to a person and is weak internal anchor text for
 * search engines. Landing pages already carry a written title, so use it.
 */
export function jobLandingLinkLabel(path: string): string {
  const hubLabel = RELATED_HUB_LABELS[path];
  if (hubLabel) return hubLabel;
  return byPath.get(path)?.title ?? path;
}

export function buildJobLandingSummary(
  definition: JobLandingDefinition,
  metrics: JobLandingMetrics,
) {
  return `${definition.heading} currently contains ${metrics.activeUniqueJobs} active unique jobs across ${metrics.companyCount} companies. SalaryPadi has seen ${metrics.uniqueJobsSeen90Days} unique matching jobs in the last 90 days. Results use canonical jobs from sources that permit public search indexing; supplemental records without those rights are excluded from this landing page.`;
}

export function evaluateJobLandingIndexability(
  definition: JobLandingDefinition,
  metrics: JobLandingMetrics,
): JobLandingIndexDecision {
  const summary = buildJobLandingSummary(definition, metrics);
  const reasons: string[] = [];
  if (metrics.activeUniqueJobs < 20)
    reasons.push("active_unique_jobs_below_20");
  if (metrics.uniqueJobsSeen90Days < 30)
    reasons.push("unique_jobs_seen_90_days_below_30");
  if (metrics.companyCount < 3) reasons.push("companies_below_3");
  if (!metrics.stableDemandSignal) reasons.push("stable_demand_signal_missing");
  if (summary.length < 180) reasons.push("deterministic_summary_too_short");
  if (definition.relatedPaths.length < 2)
    reasons.push("internal_links_missing");
  return { indexable: reasons.length === 0, reasons, summary };
}

function searchableJobText(job: Job) {
  return [job.title, job.category, job.company.name, job.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isNigeriaRelevant(job: Job) {
  return (
    job.eligibility.nigeria === "eligible" ||
    /\b(?:nigeria|lagos|abuja|port harcourt)\b/i.test(job.locationDisplay)
  );
}

/**
 * A role anchored to a physical place: declared onsite/hybrid, or a
 * non-remote role whose employer stated only a workplace location (common
 * for ATS boards that never declare a workplace type).
 */
function isPhysicalWorkMode(job: Job) {
  return (
    job.workMode === "onsite" ||
    job.workMode === "hybrid" ||
    (job.workMode !== "remote" && job.locationDisplay.trim().length > 0)
  );
}

export function matchesJobLanding(
  job: Job,
  key: JobLandingKey,
  now = new Date(),
) {
  if (!isJobCurrentlyPublishable(job, now)) return false;
  const text = searchableJobText(job);
  switch (key) {
    case "remote_nigeria":
      return (
        job.workMode === "remote" && job.eligibility.nigeria === "eligible"
      );
    case "nigeria_local":
      return (
        isPhysicalWorkMode(job) && /\bnigeria\b/i.test(job.locationDisplay)
      );
    case "nigeria_graduate":
      return (
        isNigeriaRelevant(job) &&
        (job.experienceLevel === "entry" ||
          job.employmentType === "internship" ||
          /\b(?:graduate|trainee|intern(?:ship)?|nysc)\b/i.test(text))
      );
    case "visa_sponsorship_nigeria":
      return (
        job.eligibility.nigeria === "eligible" &&
        job.eligibility.visaSponsorship === "yes"
      );
    case "nigeria_software":
      return (
        isNigeriaRelevant(job) &&
        /\b(?:software|developer|engineering|frontend|backend|devops|data engineer)\b/i.test(
          text,
        )
      );
    case "nigeria_ngo":
      return (
        isNigeriaRelevant(job) &&
        /\b(?:ngo|nonprofit|non-profit|humanitarian|development organisation|development organization)\b/i.test(
          text,
        )
      );
    case "role_software_engineering":
      return (
        isNigeriaRelevant(job) &&
        /\b(?:software engineer|software developer|frontend engineer|backend engineer|full.?stack engineer)\b/i.test(
          text,
        )
      );
    case "city_lagos":
      return isPhysicalWorkMode(job) && /\blagos\b/i.test(job.locationDisplay);
  }
}
