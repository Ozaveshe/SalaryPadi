import { getServerEnvironment, getSupabasePublicConfig } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const environment = getServerEnvironment();
  const supabase = await createServerSupabaseClient();
  const workerResult = supabase
    ? await supabase.schema("api").rpc("get_worker_health")
    : { data: null, error: new Error("Backend unavailable") };
  const workers = Array.isArray(workerResult.data) ? workerResult.data : [];
  const unhealthyWorkers = workers.filter(
    (worker) => worker.freshness !== "healthy",
  );
  const status =
    workerResult.error || unhealthyWorkers.length > 0 ? "degraded" : "ok";

  return Response.json(
    {
      status,
      service: "salarypadi-web",
      checks: {
        backend_configured: Boolean(getSupabasePublicConfig()),
        remotive_source_enabled: environment.REMOTIVE_SOURCE_ENABLED,
        providers: {
          analytics: environment.ANALYTICS_PROVIDER,
          email: environment.EMAIL_PROVIDER,
          currency_rates: environment.CURRENCY_RATE_PROVIDER,
        },
        workers,
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
