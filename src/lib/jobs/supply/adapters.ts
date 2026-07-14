import {
  assertRunnableSourcePolicy,
  type JobSourcePolicyRecord,
} from "./policy";

export const SUPPLY_ADAPTERS = {
  licensed_africa_partner: {
    kind: "licensed_partner",
    endpoint: null,
    requiredFields: ["title", "company", "application_url"] as const,
  },
  greenhouse_employer_allowlist: {
    kind: "employer_ats",
    endpoint: "documented_greenhouse_job_board_api",
    requiredFields: ["title", "company", "application_url"] as const,
  },
  lever_employer_allowlist: {
    kind: "employer_ats",
    endpoint: "documented_lever_postings_api",
    requiredFields: ["title", "company", "application_url"] as const,
  },
  ashby_employer_allowlist: {
    kind: "employer_ats",
    endpoint: "documented_ashby_public_job_posting_api",
    requiredFields: ["title", "company", "application_url"] as const,
  },
  reliefweb: {
    kind: "secondary_feed",
    endpoint: "https://api.reliefweb.int/v2/jobs",
    requiredFields: [
      "id",
      "url",
      "title",
      "source",
      "country",
      "closing_date",
    ] as const,
  },
  remotive: {
    kind: "secondary_feed",
    endpoint: "https://remotive.com/api/remote-jobs",
    requiredFields: ["id", "url", "title", "company_name"] as const,
  },
  jobicy: {
    kind: "secondary_feed",
    endpoint: "https://jobicy.com/api/v2/remote-jobs",
    requiredFields: ["id", "url", "jobTitle", "companyName"] as const,
  },
  salarypadi_employer_submissions: {
    kind: "direct_employer",
    endpoint: null,
    requiredFields: [
      "title",
      "company",
      "description",
      "application_url",
    ] as const,
  },
} as const;

export type SupplyAdapterKey = keyof typeof SUPPLY_ADAPTERS;

export function openSupplyAdapter(
  adapterKey: SupplyAdapterKey,
  now = new Date(),
): { policy: JobSourcePolicyRecord; endpoint: string | null } {
  const adapter = SUPPLY_ADAPTERS[adapterKey];
  return {
    policy: assertRunnableSourcePolicy(adapterKey, adapter.requiredFields, now),
    endpoint: adapter.endpoint,
  };
}
