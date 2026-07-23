import { z } from "zod";

import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

import type { JobSourcePolicy } from "./types";

/**
 * The columns read from the live `api.job_sources` registry row. This string
 * and the strict schema below name the same fields in the same order so the
 * select and the parse cannot drift apart.
 */
export const REVIEWED_POLICY_SELECT_COLUMNS =
  "adapter_key,source_type,terms_url,terms_reviewed_at,terms_version,attribution_required,may_store_full_description,may_index_jobs,may_emit_jobposting_schema,allow_public_listing,required_destination_kind,refresh_interval_seconds" as const;

export const reviewedPolicyRowSchema = z
  .object({
    adapter_key: z.string().min(1).max(80),
    source_type: z.string().min(1).max(40),
    terms_url: externalHttpsUrlSchema,
    terms_reviewed_at: z.iso.datetime({ offset: true }),
    terms_version: z.string().min(1).max(160),
    attribution_required: z.boolean(),
    may_store_full_description: z.boolean(),
    may_index_jobs: z.boolean(),
    may_emit_jobposting_schema: z.boolean(),
    allow_public_listing: z.boolean(),
    required_destination_kind: z.string().min(1).max(40),
    refresh_interval_seconds: z.number().int().positive().max(604_800),
  })
  .strict();

export type ReviewedPolicyRow = z.infer<typeof reviewedPolicyRowSchema>;

/**
 * What the application registry reviewed and shipped for a secondary source.
 * The live database row must continue to match this exactly for acquisition
 * to stay authorized.
 */
export interface ReviewedSourceExpectation {
  adapterKey: string;
  policy: JobSourcePolicy;
  termsVersion: string;
  requiredDestinationKind: string;
}

/**
 * True when the live operator policy row has drifted from the reviewed
 * application policy in any authorization-relevant field. Every reviewed
 * secondary source requires attribution and an explicit public-listing grant,
 * so a row that clears either flag is a mismatch, not a new permission.
 */
export function reviewedPolicyMismatch(
  row: ReviewedPolicyRow,
  reviewed: ReviewedSourceExpectation,
): boolean {
  return (
    row.adapter_key !== reviewed.adapterKey ||
    row.source_type !== reviewed.policy.type ||
    row.terms_url !== reviewed.policy.termsUrl ||
    row.terms_version !== reviewed.termsVersion ||
    !row.attribution_required ||
    row.may_store_full_description !==
      reviewed.policy.canStoreFullDescription ||
    row.may_index_jobs !== reviewed.policy.canIndex ||
    row.may_emit_jobposting_schema !==
      reviewed.policy.canUseJobPostingStructuredData ||
    !row.allow_public_listing ||
    row.required_destination_kind !== reviewed.requiredDestinationKind ||
    row.refresh_interval_seconds !== reviewed.policy.refreshIntervalSeconds
  );
}
