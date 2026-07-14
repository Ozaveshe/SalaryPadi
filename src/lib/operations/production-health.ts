import "server-only";

import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";

const timestamp = z.string().datetime({ offset: true });

const sourceRunSchema = z
  .object({
    started_at: timestamp.nullable(),
    completed_at: timestamp.nullable(),
    source_checked_at: timestamp.nullable(),
    status: z.string().min(1).max(40),
    duration_ms: z.number().int().nonnegative().nullable(),
    fetched: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative().nullable(),
    new_canonical_jobs: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative().nullable(),
    rejected: z.number().int().nonnegative().nullable(),
    closed: z.number().int().nonnegative(),
    nigeria_local: z.number().int().nonnegative().nullable(),
    explicit_nigeria_africa_eligible: z.number().int().nonnegative().nullable(),
    unclear_eligibility: z.number().int().nonnegative().nullable(),
    errors: z.number().int().nonnegative(),
    error_code: z.string().min(2).max(80).nullable(),
  })
  .strict();

const sourceSchema = z
  .object({
    adapter_key: z.string().min(2).max(80),
    name: z.string().min(2).max(160),
    status: z.string().min(2).max(40),
    allow_public_listing: z.boolean(),
    may_store_full_description: z.boolean(),
    may_index_jobs: z.boolean(),
    may_emit_jobposting_schema: z.boolean(),
    may_email_jobs: z.boolean(),
    required_destination_kind: z.string().min(2).max(80),
    refresh_interval_seconds: z.number().int().positive(),
    last_successful_import_at: timestamp.nullable(),
    runs: z.array(sourceRunSchema).max(200),
  })
  .strict();

const workerSchema = z
  .object({
    task_key: z.string().min(2).max(80),
    enabled: z.boolean(),
    expected_interval_seconds: z.number().int().positive(),
    stale_after_seconds: z.number().int().positive(),
    last_status: z
      .enum(["running", "succeeded", "failed", "skipped"])
      .nullable(),
    last_started_at: timestamp.nullable(),
    last_success_at: timestamp.nullable(),
    freshness: z.enum(["disabled", "never", "stale", "degraded", "healthy"]),
  })
  .strict();

const alertSchema = z
  .object({
    task_key: z.string().min(2).max(80),
    severity: z.enum(["warning", "critical"]),
    error_code: z.string().min(2).max(80),
    created_at: timestamp,
  })
  .strict();

export const productionHealthSchema = z
  .object({
    generated_at: timestamp,
    window_start: timestamp,
    workers: z.array(workerSchema).max(40),
    sources: z.array(sourceSchema).max(100),
    open_alerts: z.array(alertSchema).max(500),
  })
  .strict();

export type ProductionHealth = z.infer<typeof productionHealthSchema>;

const supplyDaySchema = z
  .object({
    date: timestamp,
    new_canonical_jobs: z.number().int().nonnegative(),
    raw_occurrences: z.number().int().nonnegative(),
  })
  .strict();

const supplySourceSchema = z
  .object({
    adapter_key: z.string().min(2).max(120),
    name: z.string().min(2).max(300),
    authority: z.enum([
      "direct_employer",
      "employer_ats",
      "licensed_partner",
      "secondary_feed",
    ]),
    policy_state: z.enum(["draft", "enabled", "disabled", "expired"]),
    runnable: z.boolean(),
    review_due_at: timestamp.nullable(),
    missing_dependencies: z.array(z.string().min(2).max(100)).max(30),
    new_canonical_jobs: z.number().int().nonnegative(),
    raw_occurrences: z.number().int().nonnegative(),
    run_count: z.number().int().nonnegative(),
    last_run_status: z.string().min(2).max(80).nullable(),
    fetched: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative().nullable(),
    updated: z.number().int().nonnegative(),
    duplicates: z.number().int().nonnegative().nullable(),
    rejected: z.number().int().nonnegative().nullable(),
    closed: z.number().int().nonnegative(),
    nigeria_local: z.number().int().nonnegative().nullable(),
    explicit_nigeria_africa_eligible: z.number().int().nonnegative().nullable(),
    unclear_eligibility: z.number().int().nonnegative().nullable(),
    errors: z.number().int().nonnegative(),
    last_successful_import_at: timestamp.nullable(),
  })
  .strict();

export const jobSupplyHealthSchema = z
  .object({
    generated_at: timestamp,
    window_start: timestamp,
    target_daily_new_canonical: z.number().int().positive(),
    authorized_daily_capacity: z.number().int().nonnegative(),
    seven_day_new_canonical: z.number().int().nonnegative(),
    seven_day_raw_occurrences: z.number().int().nonnegative(),
    pending_fuzzy_reviews: z.number().int().nonnegative(),
    broken_apply_links: z.number().int().nonnegative(),
    daily: z.array(supplyDaySchema).length(7),
    sources: z.array(supplySourceSchema).max(100),
  })
  .strict();

export type JobSupplyHealth = z.infer<typeof jobSupplyHealthSchema>;

type ServerSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

export async function getProductionHealth(
  suppliedClient?: ServerSupabaseClient,
): Promise<ProductionHealth> {
  const supabase = suppliedClient ?? (await createServerSupabaseClient());
  if (!supabase) throw new Error("The SalaryPadi backend is not configured.");

  const { data, error } = await supabase
    .schema("api")
    .rpc("admin_get_production_health" as never);
  if (error) throw new Error("Production health evidence is unavailable.");

  const parsed = productionHealthSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Production health evidence has an invalid shape.");
  }
  return parsed.data;
}

export async function getJobSupplyHealth(
  suppliedClient?: ServerSupabaseClient,
): Promise<JobSupplyHealth> {
  const supabase = suppliedClient ?? (await createServerSupabaseClient());
  if (!supabase) throw new Error("The SalaryPadi backend is not configured.");
  const { data, error } = await supabase
    .schema("api")
    .rpc("admin_get_job_supply_health" as never);
  if (error) throw new Error("Job supply health evidence is unavailable.");
  const parsed = jobSupplyHealthSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Job supply health evidence has an invalid shape.");
  }
  return parsed.data;
}
