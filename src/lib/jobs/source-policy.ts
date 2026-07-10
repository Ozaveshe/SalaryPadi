import type { JobSourcePolicy } from "./types";

/**
 * Official policy basis:
 * https://github.com/remotive-com/remote-jobs-api
 * Reviewed 2026-07-10. Remotive requires visible attribution and its returned
 * URL, recommends no more than four fetches/day, and prohibits submitting its
 * listings to third-party job platforms such as Google Jobs. Durable full-text
 * storage and general search indexing are not expressly granted, so both are
 * disabled in this conservative pilot policy.
 */
export const REMOTIVE_SOURCE_POLICY: JobSourcePolicy = {
  id: "remotive-public-api",
  name: "Remotive",
  type: "permitted_api",
  termsUrl: "https://github.com/remotive-com/remote-jobs-api",
  termsReviewedAt: "2026-07-10",
  attributionRequired: "Show “Source: Remotive” and link to the returned URL.",
  canStoreFullDescription: false,
  canIndex: false,
  canUseJobPostingStructuredData: false,
  destinationRequirement: "Use the Remotive URL returned by the API.",
  // The public cache and the alert-catalog worker are separate consumers.
  // Twelve hours each keeps their combined normal operation at four reads/day.
  refreshIntervalSeconds: 43_200,
};
