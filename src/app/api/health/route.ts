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

/**
 * Task keys are validated by SHAPE, not against the expected registry.
 *
 * This schema previously used `z.enum(EXPECTED_WORKER_KEYS)`. Because a Zod
 * array parse is all-or-nothing, a single schedule row whose key was not yet
 * in config/production-workers.json failed the entire array, so `workers`
 * collapsed to `[]` and every real worker became invisible — reported as
 * "missing" by the freshness workflow even while it was running healthily.
 * Registry drift must be *reported*, never allowed to erase observability, so
 * unknown keys are now parsed and surfaced explicitly as `unregistered_workers`
 * (which still fails `worker_health_complete` and still returns 503).
 */
const workerTaskKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,79}$/);

const workerHealthSchema = z
  .array(
    z
      .object({
        task_key: workerTaskKeySchema,
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
  const expectedKeys = new Set<string>(EXPECTED_WORKER_KEYS);
  /** Registered workers the database did not report at all. */
  const missingWorkers = EXPECTED_WORKER_KEYS.filter(
    (taskKey) => !workerKeys.has(taskKey),
  );
  const unknownToRegistry = workers.filter(
    (worker) => !expectedKeys.has(worker.task_key),
  );
  /**
   * An ACTIVE schedule this deployment has no worker for. Real drift: the
   * database will expect runs nothing can produce, so it fails health.
   */
  const unregisteredWorkers = [
    ...new Set(
      unknownToRegistry
        .filter((worker) => worker.freshness !== "disabled")
        .map((worker) => worker.task_key),
    ),
  ].toSorted();
  /**
   * A DISABLED schedule this deployment has no worker for — a schedule parked
   * ahead of the worker that will use it. Reported for visibility, but not a
   * fault: a disabled schedule asks nothing of the platform.
   */
  const parkedWorkers = [
    ...new Set(
      unknownToRegistry
        .filter((worker) => worker.freshness === "disabled")
        .map((worker) => worker.task_key),
    ),
  ].toSorted();
  const workerHealthComplete =
    parsedWorkers.success &&
    workerKeys.size === workers.length &&
    missingWorkers.length === 0 &&
    unregisteredWorkers.length === 0;
  /**
   * A deliberately disabled schedule is a known, honest state, not a fault.
   * Every other non-healthy freshness (never, stale, degraded) is a fault and
   * keeps the endpoint at 503 so the canary and freshness workflows still see
   * it.
   */
  const unhealthyWorkers = workers.filter(
    (worker) =>
      worker.freshness !== "healthy" && worker.freshness !== "disabled",
  );
  /**
   * Worker health and source-supply capacity are separate concerns.
   *
   * `authorized_daily_capacity` is a RIGHTS state: it sums
   * `expected_daily_new_canonical` over sources whose policy is runnable and
   * that carry recorded capacity evidence. With every high-volume source
   * intentionally unauthorised it is legitimately 0, and no amount of correct
   * worker execution can raise it. Letting that permanently pin the service to
   * 503 made the endpoint unable to ever report the thing it exists to report:
   * whether the deployment and its workers are functioning.
   *
   * Supply capacity therefore stays fully visible in the payload
   * (`job_supply_ready`, `job_supply.state`) and is asserted separately by the
   * freshness workflow, but it no longer masks worker health in the HTTP
   * status. No worker check is relaxed: a missing, never-run, stale or failed
   * worker still returns 503.
   */
  const workersOperational =
    !workerResult.error &&
    parsedWorkers.success &&
    workerHealthComplete &&
    unhealthyWorkers.length === 0;
  const status =
    !workersOperational ||
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
        /** Registered workers the database did not report. */
        missing_workers: missingWorkers,
        /** Active schedule rows this deployment has no worker for. */
        unregistered_workers: unregisteredWorkers,
        /** Disabled schedule rows parked ahead of their worker. */
        parked_workers: parkedWorkers,
        /** Reported workers that are neither healthy nor deliberately disabled. */
        unhealthy_workers: unhealthyWorkers.map((worker) => worker.task_key),
        /**
         * Source-supply capacity, reported truthfully and independently of
         * worker health. False here means SalaryPadi does not hold authorised
         * capacity for the daily target — not that a worker failed.
         */
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
