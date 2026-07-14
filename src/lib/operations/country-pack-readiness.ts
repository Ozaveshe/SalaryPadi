import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const timestamp = z.string().datetime({ offset: true });
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
    blockers: z.array(z.string().min(2).max(100)).max(20),
    metrics: metricSchema,
    thresholds: thresholdSchema,
  })
  .strict();

export const countryPackReadinessSchema = z
  .object({
    generated_at: timestamp,
    countries: z.array(countrySchema).length(4),
  })
  .strict();

export type CountryPackReadiness = z.infer<typeof countryPackReadinessSchema>;

type ServerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

export async function getCountryPackReadiness(
  suppliedClient?: ServerSupabaseClient,
): Promise<CountryPackReadiness> {
  const supabase = suppliedClient ?? (await createServerSupabaseClient());
  if (!supabase) throw new Error("The SalaryPadi backend is not configured.");
  const { data, error } = await supabase
    .schema("api")
    .rpc("admin_get_country_pack_readiness" as never);
  if (error) throw new Error("Country pack readiness evidence is unavailable.");
  const parsed = countryPackReadinessSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Country pack readiness evidence has an invalid shape.");
  }
  return parsed.data;
}
