import "server-only";

import { z } from "zod";

import type { RepositoryResult } from "@/lib/data/repository-result";
import {
  readOperationsEvidence,
  type OperationsSupabaseClient,
} from "@/lib/operations/evidence";

const timestamp = z.string().datetime({ offset: true });
const HEALTH_SNAPSHOT_MAX_FUTURE_SKEW_MS = 5 * 60_000;
const importStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "partially_succeeded",
  "failed",
  "cancelled",
]);

function hasUniqueValues<T>(values: T[]) {
  return new Set(values).size === values.length;
}

const sourceRunSchema = z
  .object({
    started_at: timestamp.nullable(),
    completed_at: timestamp.nullable(),
    source_checked_at: timestamp.nullable(),
    status: importStatusSchema,
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
  .strict()
  .superRefine((run, context) => {
    if (
      run.started_at &&
      run.completed_at &&
      Date.parse(run.completed_at) < Date.parse(run.started_at)
    ) {
      context.addIssue({
        code: "custom",
        path: ["completed_at"],
        message: "A source run cannot complete before it starts.",
      });
    }
    const terminal = !["queued", "running"].includes(run.status);
    if (terminal !== (run.completed_at !== null)) {
      context.addIssue({
        code: "custom",
        path: ["completed_at"],
        message: "Import completion must agree with its lifecycle status.",
      });
    }
    if (
      run.duration_ms !== null &&
      (run.started_at === null || run.completed_at === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["duration_ms"],
        message: "Import duration requires start and completion evidence.",
      });
    }
    if (
      run.source_checked_at &&
      run.completed_at &&
      Date.parse(run.source_checked_at) >
        Date.parse(run.completed_at) + 5 * 60_000
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_checked_at"],
        message: "Source evidence cannot postdate import completion.",
      });
    }
    if ((run.errors === 0) !== (run.error_code === null)) {
      context.addIssue({
        code: "custom",
        path: ["error_code"],
        message: "Import error counts and error codes must agree.",
      });
    }
    if (run.status === "succeeded" && run.errors !== 0) {
      context.addIssue({
        code: "custom",
        path: ["errors"],
        message: "A successful import cannot report errors.",
      });
    }
  });

const sourceSchema = z
  .object({
    adapter_key: z.string().min(2).max(80),
    name: z.string().min(2).max(160),
    status: z.literal("active"),
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
  .strict()
  .superRefine((worker, context) => {
    if (worker.stale_after_seconds < worker.expected_interval_seconds) {
      context.addIssue({
        code: "custom",
        path: ["stale_after_seconds"],
        message: "Worker staleness cannot precede its expected interval.",
      });
    }
    if (worker.enabled === (worker.freshness === "disabled")) {
      context.addIssue({
        code: "custom",
        path: ["freshness"],
        message: "Worker enabled state and freshness disagree.",
      });
    }
    if (
      worker.freshness === "never" &&
      (worker.last_started_at !== null || worker.last_success_at !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["last_started_at"],
        message: "A never-run worker cannot have run timestamps.",
      });
    }
    if (worker.last_success_at !== null && worker.last_started_at === null) {
      context.addIssue({
        code: "custom",
        path: ["last_success_at"],
        message: "A successful worker must have started.",
      });
    }
  });

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
  .strict()
  .superRefine((health, context) => {
    const latestSnapshotEvidence =
      Date.parse(health.generated_at) + HEALTH_SNAPSHOT_MAX_FUTURE_SKEW_MS;
    if (Date.parse(health.window_start) > Date.parse(health.generated_at)) {
      context.addIssue({
        code: "custom",
        path: ["window_start"],
        message: "The production-health window cannot start in the future.",
      });
    }
    if (!hasUniqueValues(health.workers.map((worker) => worker.task_key))) {
      context.addIssue({
        code: "custom",
        path: ["workers"],
        message: "Production-health worker keys must be unique.",
      });
    }
    if (!hasUniqueValues(health.sources.map((source) => source.adapter_key))) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Production-health source keys must be unique.",
      });
    }
    health.workers.forEach((worker, index) => {
      for (const field of ["last_started_at", "last_success_at"] as const) {
        const value = worker[field];
        if (value && Date.parse(value) > latestSnapshotEvidence) {
          context.addIssue({
            code: "custom",
            path: ["workers", index, field],
            message: "Worker evidence cannot postdate its health snapshot.",
          });
        }
      }
    });
    health.sources.forEach((source, sourceIndex) => {
      if (
        source.last_successful_import_at &&
        Date.parse(source.last_successful_import_at) > latestSnapshotEvidence
      ) {
        context.addIssue({
          code: "custom",
          path: ["sources", sourceIndex, "last_successful_import_at"],
          message: "Source success cannot postdate its health snapshot.",
        });
      }
      source.runs.forEach((run, runIndex) => {
        for (const field of [
          "started_at",
          "completed_at",
          "source_checked_at",
        ] as const) {
          const value = run[field];
          if (value && Date.parse(value) > latestSnapshotEvidence) {
            context.addIssue({
              code: "custom",
              path: ["sources", sourceIndex, "runs", runIndex, field],
              message:
                "Source-run evidence cannot postdate its health snapshot.",
            });
          }
        }
      });
    });
    health.open_alerts.forEach((alert, index) => {
      if (Date.parse(alert.created_at) > latestSnapshotEvidence) {
        context.addIssue({
          code: "custom",
          path: ["open_alerts", index, "created_at"],
          message: "Operational alerts cannot postdate their health snapshot.",
        });
      }
    });
  });

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
    last_run_status: importStatusSchema.nullable(),
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
  .strict()
  .superRefine((health, context) => {
    const latestSnapshotEvidence =
      Date.parse(health.generated_at) + HEALTH_SNAPSHOT_MAX_FUTURE_SKEW_MS;
    if (Date.parse(health.window_start) > Date.parse(health.generated_at)) {
      context.addIssue({
        code: "custom",
        path: ["window_start"],
        message: "The job-supply window cannot start in the future.",
      });
    }
    const dailyTimestamps = health.daily.map((day) => Date.parse(day.date));
    if (
      !hasUniqueValues(dailyTimestamps) ||
      dailyTimestamps.some(
        (timestamp, index) =>
          index > 0 && timestamp - dailyTimestamps[index - 1]! !== 86_400_000,
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["daily"],
        message: "Job-supply days must be unique and chronological.",
      });
    }
    health.daily.forEach((day, index) => {
      if (Date.parse(day.date) > latestSnapshotEvidence) {
        context.addIssue({
          code: "custom",
          path: ["daily", index, "date"],
          message: "Daily supply evidence cannot postdate its health snapshot.",
        });
      }
      if (day.raw_occurrences < day.new_canonical_jobs) {
        context.addIssue({
          code: "custom",
          path: ["daily", index, "raw_occurrences"],
          message: "Canonical creation cannot exceed source occurrences.",
        });
      }
    });
    if (!hasUniqueValues(health.sources.map((source) => source.adapter_key))) {
      context.addIssue({
        code: "custom",
        path: ["sources"],
        message: "Job-supply source keys must be unique.",
      });
    }
    for (const [index, source] of health.sources.entries()) {
      if (
        source.last_successful_import_at &&
        Date.parse(source.last_successful_import_at) > latestSnapshotEvidence
      ) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "last_successful_import_at"],
          message: "Source success cannot postdate its health snapshot.",
        });
      }
      if (!hasUniqueValues(source.missing_dependencies)) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "missing_dependencies"],
          message: "Missing source dependencies must be unique.",
        });
      }
      if (
        source.runnable &&
        (source.policy_state !== "enabled" ||
          source.missing_dependencies.length > 0)
      ) {
        context.addIssue({
          code: "custom",
          path: ["sources", index, "runnable"],
          message:
            "A runnable source must be enabled with no missing dependency.",
        });
      }
    }
  });

export type JobSupplyHealth = z.infer<typeof jobSupplyHealthSchema>;

export function getProductionHealthResult(
  suppliedClient?: OperationsSupabaseClient,
): Promise<RepositoryResult<ProductionHealth | null>> {
  return readOperationsEvidence({
    suppliedClient,
    operation: "operations.production_health",
    rpc: "admin_get_production_health",
    schema: productionHealthSchema,
    codes: {
      unconfigured: "production_health_backend_unconfigured",
      queryFailed: "production_health_query_failed",
      invalid: "production_health_invalid",
    },
  });
}

export async function getProductionHealth(
  suppliedClient?: OperationsSupabaseClient,
): Promise<ProductionHealth> {
  const result = await getProductionHealthResult(suppliedClient);
  if (result.data) return result.data;
  if (result.state === "unconfigured") {
    throw new Error("The SalaryPadi backend is not configured.");
  }
  if (result.state === "invalid") {
    throw new Error("Production health evidence has an invalid shape.");
  }
  throw new Error("Production health evidence is unavailable.");
}

export function getJobSupplyHealthResult(
  suppliedClient?: OperationsSupabaseClient,
): Promise<RepositoryResult<JobSupplyHealth | null>> {
  return readOperationsEvidence({
    suppliedClient,
    operation: "operations.job_supply_health",
    rpc: "admin_get_job_supply_health",
    schema: jobSupplyHealthSchema,
    codes: {
      unconfigured: "job_supply_health_backend_unconfigured",
      queryFailed: "job_supply_health_query_failed",
      invalid: "job_supply_health_invalid",
    },
  });
}

export async function getJobSupplyHealth(
  suppliedClient?: OperationsSupabaseClient,
): Promise<JobSupplyHealth> {
  const result = await getJobSupplyHealthResult(suppliedClient);
  if (result.data) return result.data;
  if (result.state === "unconfigured") {
    throw new Error("The SalaryPadi backend is not configured.");
  }
  if (result.state === "invalid") {
    throw new Error("Job supply health evidence has an invalid shape.");
  }
  throw new Error("Job supply health evidence is unavailable.");
}
