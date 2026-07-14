import type { JobSourcePolicy } from "./types";

/**
 * Reviewed 2026-07-14 against both the public API page and current general
 * terms. Their sharing/republication language conflicts, so the database
 * policy and environment kill switch keep this adapter disabled until written
 * clarification. These field flags are the most restrictive interpretation
 * and do not themselves authorize a provider request.
 */
export const REMOTIVE_SOURCE_POLICY: JobSourcePolicy = {
  id: "remotive-public-api",
  name: "Remotive",
  type: "permitted_api",
  termsUrl: "https://remotive.com/terms-of-use",
  termsReviewedAt: "2026-07-14",
  attributionRequired: 'Show "Source: Remotive" and link to the returned URL.',
  canStoreFullDescription: false,
  canIndex: false,
  canUseJobPostingStructuredData: false,
  canEmail: false,
  destinationRequirement: "Use the Remotive URL returned by the API.",
  refreshIntervalSeconds: 21_600,
};

export const REMOTIVE_ADAPTER_KEY = "remotive" as const;
export const REMOTIVE_REQUIRED_DESTINATION_KIND = "source_url" as const;
export const REMOTIVE_CACHE_TAG = "salarypadi-job-source-remotive" as const;
export const REMOTIVE_TERMS_VERSION =
  "remotive-terms-conflict-reviewed-2026-07-14" as const;
