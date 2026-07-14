import {
  getAfroToolsConfig,
  getServerEnvironment,
  getSupabasePublicConfig,
} from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const expectedWorkerKeys = [
  "alert_delivery",
  "currency_rates",
  "job_source_sync",
  "ats_source_sync",
  "operations_maintenance",
  "editorial_job_snapshot",
  "editorial_topic_candidates",
  "editorial_draft",
  "editorial_preflight",
  "editorial_queue",
  "editorial_publish",
  "editorial_live_blocks",
  "editorial_nightly_audit",
  "editorial_weekly_audit",
  "afrotools_catalog_sync",
  "job_supply_dispatcher",
  "job_lifecycle",
  "apply_link_check",
  "job_dedupe_review",
  "source_health_digest",
  "source_rights_review",
] as const;

const workerHealthSchema = z
  .array(
    z.object({
      task_key: z.string().min(1).max(80),
      owner_label: z.string().min(1).max(160),
      last_status: z
        .enum(["running", "succeeded", "failed", "skipped"])
        .nullable(),
      last_started_at: z.string().nullable(),
      last_success_at: z.string().nullable(),
      freshness: z.enum(["disabled", "never", "stale", "degraded", "healthy"]),
    }),
  )
  .max(30);

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
  const supabase = await createServerSupabaseClient();
  const workerResult = supabase
    ? await supabase.schema("api").rpc("get_worker_health")
    : { data: null, error: new Error("Backend unavailable") };
  const parsedWorkers = workerHealthSchema.safeParse(workerResult.data);
  const workers = parsedWorkers.success ? parsedWorkers.data : [];
  const workerKeys = new Set(workers.map((worker) => worker.task_key));
  const workerHealthComplete =
    parsedWorkers.success &&
    workerKeys.size === workers.length &&
    expectedWorkerKeys.every((taskKey) => workerKeys.has(taskKey));
  const unhealthyWorkers = workers.filter(
    (worker) => worker.freshness !== "healthy",
  );
  const status =
    workerResult.error ||
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
