import {
  getAfroToolsConfig,
  getServerEnvironment,
  getSupabasePublicConfig,
} from "@/lib/env";
import { attemptRepositoryOperation } from "@/lib/data/repository-operation";
import { repositoryIssue } from "@/lib/data/repository-result";
import { EXPECTED_WORKER_KEYS } from "@/lib/operations/worker-registry";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const workerHealthSchema = z
  .array(
    z
      .object({
        task_key: z.enum(EXPECTED_WORKER_KEYS),
        owner_label: z.string().trim().min(1).max(160),
        last_status: z
          .enum(["running", "succeeded", "failed", "skipped"])
          .nullable(),
        last_started_at: z.string().datetime({ offset: true }).nullable(),
        last_success_at: z.string().datetime({ offset: true }).nullable(),
        freshness: z.enum([
          "disabled",
          "never",
          "stale",
          "degraded",
          "healthy",
        ]),
      })
      .strict()
      .superRefine((worker, context) => {
        if (
          worker.freshness === "healthy" &&
          worker.last_status !== "succeeded" &&
          worker.last_status !== "skipped"
        ) {
          context.addIssue({
            code: "custom",
            path: ["freshness"],
            message: "Healthy workers require a completed safe run.",
          });
        }
        if (
          worker.freshness === "degraded" &&
          worker.last_status !== "failed"
        ) {
          context.addIssue({
            code: "custom",
            path: ["freshness"],
            message: "Degraded worker freshness requires a failed run.",
          });
        }
      }),
  )
  .max(30);

const jobSupplyCanarySchema = z
  .object({
    generated_at: z.string().datetime({ offset: true }),
    visible_remote_jobs: z.number().int().nonnegative(),
    target_daily_new_canonical: z.number().int().positive(),
    authorized_daily_capacity: z.number().int().nonnegative(),
    last_canonical_created_at: z.string().datetime({ offset: true }).nullable(),
    state: z.enum(["unavailable", "capacity_unproven", "stale", "ready"]),
  })
  .strict()
  .superRefine((supply, context) => {
    const generatedAt = Date.parse(supply.generated_at);
    if (
      supply.last_canonical_created_at !== null &&
      Date.parse(supply.last_canonical_created_at) > generatedAt + 5 * 60_000
    ) {
      context.addIssue({
        code: "custom",
        path: ["last_canonical_created_at"],
        message: "Canonical creation evidence cannot postdate the canary.",
      });
    }
    if (
      supply.state === "ready" &&
      (supply.visible_remote_jobs < 1 ||
        supply.authorized_daily_capacity < supply.target_daily_new_canonical ||
        supply.last_canonical_created_at === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["state"],
        message: "Ready supply requires visible jobs and proven capacity.",
      });
    }
  });

type HealthSupabaseClient = NonNullable<
  Awaited<ReturnType<typeof createServerSupabaseClient>>
>;

async function readHealthRpc(
  supabase: HealthSupabaseClient,
  rpc: string,
  operation: string,
) {
  const attempt = await attemptRepositoryOperation(() =>
    supabase.schema("api").rpc(rpc as never),
  );
  if (attempt.ok) return attempt.value;

  repositoryIssue(
    operation,
    "query_failed",
    `${operation.replaceAll(".", "_")}_failed`,
    attempt.error,
  );
  return { data: null, error: new Error("Health evidence unavailable") };
}

export async function GET() {
  const environment = getServerEnvironment();
  const backendConfigured = Boolean(getSupabasePublicConfig());
  const workerBackendConfigured = Boolean(
    environment.SUPABASE_SERVICE_ROLE_KEY,
  );
  const sourceRefreshConfigured = Boolean(environment.JOB_SOURCE_SYNC_TOKEN);
  const afroToolsConfigured = Boolean(getAfroToolsConfig().apiKey);
  const providersReady = {
    analytics: environment.ANALYTICS_PROVIDER === "supabase_first_party",
    currency_rates:
      environment.CURRENCY_RATE_PROVIDER === "european_commission_inforeuro",
    email: Boolean(
      environment.EMAIL_PROVIDER === "resend" &&
      environment.RESEND_API_KEY &&
      environment.TRANSACTIONAL_EMAIL_FROM &&
      environment.TRANSACTIONAL_EMAIL_REPLY_TO,
    ),
    editorial: environment.EDITORIAL_AUTOMATION_ENABLED,
    source_policy_fail_closed: true,
  };
  const operationsConfigured =
    workerBackendConfigured &&
    sourceRefreshConfigured &&
    Object.values(providersReady).every(Boolean);
  const clientAttempt = await attemptRepositoryOperation(() =>
    createServerSupabaseClient(),
  );
  if (!clientAttempt.ok) {
    repositoryIssue(
      "health.backend_client",
      "query_failed",
      "health_backend_client_failed",
      clientAttempt.error,
    );
  }
  const supabase = clientAttempt.ok ? clientAttempt.value : null;
  const [workerResult, supplyResult] = supabase
    ? await Promise.all([
        readHealthRpc(supabase, "get_worker_health", "health.worker_health"),
        readHealthRpc(supabase, "get_job_supply_canary", "health.job_supply"),
      ])
    : [
        { data: null, error: new Error("Backend unavailable") },
        { data: null, error: new Error("Backend unavailable") },
      ];
  const parsedWorkers = workerHealthSchema.safeParse(workerResult.data);
  const parsedSupply = jobSupplyCanarySchema.safeParse(supplyResult.data);
  const workers = parsedWorkers.success ? parsedWorkers.data : [];
  const workerKeys = new Set(workers.map((worker) => worker.task_key));
  const workerHealthComplete =
    parsedWorkers.success &&
    workers.length === EXPECTED_WORKER_KEYS.length &&
    workerKeys.size === workers.length &&
    EXPECTED_WORKER_KEYS.every((taskKey) => workerKeys.has(taskKey));
  const unhealthyWorkers = workers.filter(
    (worker) => worker.freshness !== "healthy",
  );
  const status =
    workerResult.error ||
    supplyResult.error ||
    !parsedSupply.success ||
    parsedSupply.data.state !== "ready" ||
    !workerHealthComplete ||
    unhealthyWorkers.length > 0 ||
    !backendConfigured ||
    !afroToolsConfigured ||
    !operationsConfigured
      ? "degraded"
      : "ok";

  return Response.json(
    {
      status,
      service: "salarypadi-web",
      checks: {
        backend_configured: backendConfigured,
        worker_backend_configured: workerBackendConfigured,
        source_refresh_configured: sourceRefreshConfigured,
        afrotools_configured: afroToolsConfigured,
        operations_configured: operationsConfigured,
        worker_health_complete: workerHealthComplete,
        job_supply_ready:
          parsedSupply.success && parsedSupply.data.state === "ready",
        job_supply: parsedSupply.success
          ? parsedSupply.data
          : { state: "unavailable" as const },
        remotive_source_enabled: environment.REMOTIVE_SOURCE_ENABLED,
        providers: {
          analytics: environment.ANALYTICS_PROVIDER,
          email: environment.EMAIL_PROVIDER,
          currency_rates: environment.CURRENCY_RATE_PROVIDER,
        },
        providers_ready: providersReady,
        workers,
      },
    },
    {
      status: status === "ok" ? 200 : 503,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
