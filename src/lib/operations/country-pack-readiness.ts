import "server-only";

import { z } from "zod";

import type { RepositoryResult } from "@/lib/data/repository-result";
import {
  readOperationsEvidence,
  type OperationsSupabaseClient,
} from "@/lib/operations/evidence";

const timestamp = z.string().datetime({ offset: true });
const blockerSchema = z.enum([
  "authorized_job_supply",
  "source_diversity",
  "local_eligibility_accuracy",
  "reviewed_statutory_rules",
  "unique_localized_content",
  "first_party_data",
  "moderation_privacy_takedown",
  "seo_canonical_hreflang",
]);
const metricSchema = z
  .object({
    authorized_active_jobs: z.number().int().nonnegative(),
    authorized_sources: z.number().int().nonnegative(),
    explicit_eligibility_ratio: z.number().min(0).max(1),
    unique_content_pages: z.number().int().nonnegative(),
    first_party_contributions: z.number().int().nonnegative(),
    reviewed_tax_rules: z.number().int().nonnegative(),
    reviewed_employment_rules: z.number().int().nonnegative(),
  })
  .strict();

const thresholdSchema = metricSchema.pick({
  authorized_active_jobs: true,
  authorized_sources: true,
  explicit_eligibility_ratio: true,
  unique_content_pages: true,
  first_party_contributions: true,
});

const countrySchema = z
  .object({
    country_code: z.enum(["NG", "GH", "KE", "ZA"]),
    name: z.string().min(2).max(100),
    pack_state: z.enum(["candidate", "launch", "active", "suspended"]),
    route_prefix: z.string().max(10),
    default_locale: z.string().min(2).max(35),
    currency_code: z.string().regex(/^[A-Z]{3}$/),
    time_zone: z.string().min(3).max(100),
    public_routes_enabled: z.boolean(),
    search_index_enabled: z.boolean(),
    activation_ready: z.boolean(),
    blockers: z.array(blockerSchema).max(20),
    metrics: metricSchema,
    thresholds: thresholdSchema,
  })
  .strict();

export const countryPackReadinessSchema = z
  .object({
    generated_at: timestamp,
    countries: z.array(countrySchema).length(4),
  })
  .strict()
  .superRefine((readiness, context) => {
    const countryCodes = readiness.countries.map(
      (country) => country.country_code,
    );
    if (new Set(countryCodes).size !== countryCodes.length) {
      context.addIssue({
        code: "custom",
        path: ["countries"],
        message: "Country readiness rows must be unique.",
      });
    }
    for (const [index, country] of readiness.countries.entries()) {
      const blockers = new Set(country.blockers);
      if (country.activation_ready !== (country.blockers.length === 0)) {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "activation_ready"],
          message: "Activation readiness and blockers disagree.",
        });
      }
      if (new Set(country.blockers).size !== country.blockers.length) {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "blockers"],
          message: "Country readiness blockers must be unique.",
        });
      }
      if (country.search_index_enabled && !country.public_routes_enabled) {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "search_index_enabled"],
          message: "Search indexing requires public country routes.",
        });
      }
      if (
        (country.public_routes_enabled || country.search_index_enabled) &&
        !["launch", "active"].includes(country.pack_state)
      ) {
        context.addIssue({
          code: "custom",
          path: ["countries", index, "pack_state"],
          message: "Candidate or suspended country packs cannot be public.",
        });
      }
      for (const [blocked, blocker] of [
        [
          country.metrics.authorized_active_jobs <
            country.thresholds.authorized_active_jobs,
          "authorized_job_supply",
        ],
        [
          country.metrics.authorized_sources <
            country.thresholds.authorized_sources,
          "source_diversity",
        ],
        [
          country.metrics.explicit_eligibility_ratio <
            country.thresholds.explicit_eligibility_ratio,
          "local_eligibility_accuracy",
        ],
        [
          country.metrics.reviewed_tax_rules < 1 ||
            country.metrics.reviewed_employment_rules < 1,
          "reviewed_statutory_rules",
        ],
        [
          country.metrics.unique_content_pages <
            country.thresholds.unique_content_pages,
          "unique_localized_content",
        ],
        [
          country.metrics.first_party_contributions <
            country.thresholds.first_party_contributions,
          "first_party_data",
        ],
      ] as const) {
        if (blocked && !blockers.has(blocker)) {
          context.addIssue({
            code: "custom",
            path: ["countries", index, "blockers"],
            message: `Measured readiness failure requires ${blocker}.`,
          });
        }
      }
    }
  });

export type CountryPackReadiness = z.infer<typeof countryPackReadinessSchema>;

export function getCountryPackReadinessResult(
  suppliedClient?: OperationsSupabaseClient,
): Promise<RepositoryResult<CountryPackReadiness | null>> {
  return readOperationsEvidence({
    suppliedClient,
    operation: "operations.country_pack_readiness",
    rpc: "admin_get_country_pack_readiness",
    schema: countryPackReadinessSchema,
    codes: {
      unconfigured: "country_pack_readiness_backend_unconfigured",
      queryFailed: "country_pack_readiness_query_failed",
      invalid: "country_pack_readiness_invalid",
    },
  });
}

export async function getCountryPackReadiness(
  suppliedClient?: OperationsSupabaseClient,
): Promise<CountryPackReadiness> {
  const result = await getCountryPackReadinessResult(suppliedClient);
  if (result.data) return result.data;
  if (result.state === "unconfigured") {
    throw new Error("The SalaryPadi backend is not configured.");
  }
  if (result.state === "invalid") {
    throw new Error("Country pack readiness evidence has an invalid shape.");
  }
  throw new Error("Country pack readiness evidence is unavailable.");
}
