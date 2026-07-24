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

/**
 * Jobicy explicitly documents its public feed for integration into websites
 * and wider distribution. SalaryPadi keeps only minimal metadata, links every
 * role back to Jobicy, does not index or emit JobPosting markup for these
 * records, and polls no more frequently than every six hours.
 */
export const JOBICY_SOURCE_POLICY: JobSourcePolicy = {
  id: "jobicy-public-api",
  name: "Jobicy",
  type: "permitted_api",
  termsUrl: "https://jobicy.com/jobs-rss-feed",
  termsReviewedAt: "2026-07-14",
  attributionRequired: 'Show "Source: Jobicy" and link to the returned URL.',
  canStoreFullDescription: false,
  canIndex: false,
  canUseJobPostingStructuredData: false,
  canEmail: false,
  destinationRequirement: "Use the Jobicy URL returned by the API.",
  refreshIntervalSeconds: 21_600,
};

export const JOBICY_ADAPTER_KEY = "jobicy" as const;
export const JOBICY_REQUIRED_DESTINATION_KIND = "source_url" as const;
export const JOBICY_CACHE_TAG = "salarypadi-job-source-jobicy" as const;
export const JOBICY_TERMS_VERSION =
  "jobicy-public-feed-reviewed-2026-07-14" as const;

/**
 * Himalayas explicitly permits its public API to backfill other job boards.
 * SalaryPadi retains only bounded metadata and excerpts, visibly links back to
 * Himalayas, refreshes daily, and excludes these jobs from search engines,
 * Google JobPosting markup, email distribution, and downstream syndication.
 */
export const HIMALAYAS_SOURCE_POLICY: JobSourcePolicy = {
  id: "himalayas-public-api",
  name: "Himalayas",
  type: "permitted_api",
  termsUrl: "https://himalayas.app/api",
  termsReviewedAt: "2026-07-15",
  attributionRequired:
    'Show "Source: Himalayas" and link to the returned Himalayas URL.',
  canStoreFullDescription: false,
  canIndex: false,
  canUseJobPostingStructuredData: false,
  canEmail: false,
  destinationRequirement: "Use the Himalayas URL returned by the API.",
  refreshIntervalSeconds: 86_400,
};

/**
 * ReliefWeb's API is documented and free but its content carries the original
 * information partners' rights, and API access above trial volume requires a
 * pre-approved appname. SalaryPadi's application is submitted and pending;
 * until it is granted this policy stays behind the disabled registry entry,
 * the environment kill switch, and the absent database policy row. Metadata
 * only, always attributed to ReliefWeb and the named partner.
 */
export const RELIEFWEB_SOURCE_POLICY: JobSourcePolicy = {
  id: "reliefweb-jobs-api",
  name: "ReliefWeb",
  type: "permitted_api",
  termsUrl: "https://apidoc.reliefweb.int/",
  termsReviewedAt: "2026-07-14",
  attributionRequired:
    'Show "Source: ReliefWeb" with the named information partner and link to the returned ReliefWeb URL.',
  canStoreFullDescription: false,
  canIndex: false,
  canUseJobPostingStructuredData: false,
  canEmail: false,
  destinationRequirement: "Use the ReliefWeb URL returned by the API.",
  refreshIntervalSeconds: 21_600,
};

export const RELIEFWEB_ADAPTER_KEY = "reliefweb" as const;
export const RELIEFWEB_REQUIRED_DESTINATION_KIND = "source_url" as const;
export const RELIEFWEB_CACHE_TAG = "salarypadi-job-source-reliefweb" as const;
export const RELIEFWEB_TERMS_VERSION =
  "reliefweb-api-terms-reviewed-2026-07-14" as const;

export const HIMALAYAS_ADAPTER_KEY = "himalayas" as const;
export const HIMALAYAS_REQUIRED_DESTINATION_KIND = "source_url" as const;
export const HIMALAYAS_CACHE_TAG = "salarypadi-job-source-himalayas" as const;
export const HIMALAYAS_TERMS_VERSION =
  "himalayas-public-api-reviewed-2026-07-15" as const;
