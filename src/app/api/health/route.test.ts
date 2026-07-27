import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getAfroToolsConfig: vi.fn(),
  getServerEnvironment: vi.fn(),
  getSupabasePublicConfig: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));

import { GET } from "@/app/api/health/route";
import {
  getAfroToolsConfig,
  getServerEnvironment,
  getSupabasePublicConfig,
} from "@/lib/env";
import { EXPECTED_WORKER_KEYS } from "@/lib/operations/worker-registry";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const environment = {
  NEXT_PUBLIC_APP_URL: "https://salarypadi.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  JOB_SOURCE_SYNC_TOKEN: "test-source-sync-token",
  AFROTOOLS_API_BASE_URL: "https://afrotools.com/api/v1",
  AFROTOOLS_API_KEY: "test-afrotools-key",
  RESEND_API_KEY: "test-resend-key",
  TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <updates@mail.salarypadi.com>",
  TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
  REMOTIVE_SOURCE_ENABLED: true,
  RELIEFWEB_SOURCE_ENABLED: false,
  AUTH_GOOGLE_ENABLED: false,
  AUTH_LINKEDIN_ENABLED: false,
  EDITORIAL_AUTOMATION_ENABLED: true,
  ALLOW_DEMO_DATA: false,
  ANALYTICS_PROVIDER: "supabase_first_party" as const,
  EMAIL_PROVIDER: "resend" as const,
  CURRENCY_RATE_PROVIDER: "european_commission_inforeuro" as const,
  NODE_ENV: "production" as const,
};

type WorkerRow = {
  task_key: string;
  owner_label: string;
  last_status: "running" | "succeeded" | "failed" | "skipped" | null;
  last_started_at: string | null;
  last_success_at: string | null;
  freshness: "disabled" | "never" | "stale" | "degraded" | "healthy";
};

const healthyWorkers: WorkerRow[] = EXPECTED_WORKER_KEYS.map((taskKey) => ({
  task_key: taskKey,
  owner_label: "Test operations owner",
  last_status: "succeeded",
  last_started_at: "2026-07-10T12:00:00.000Z",
  last_success_at: "2026-07-10T12:00:01.000Z",
  freshness: "healthy",
}));

const readyJobSupply = {
  generated_at: "2026-07-10T12:00:02.000Z",
  visible_remote_jobs: 1_200,
  target_daily_new_canonical: 500,
  authorized_daily_capacity: 650,
  last_canonical_created_at: "2026-07-10T11:59:00.000Z",
  state: "ready",
} as const;

function mockWorkerResult(
  data: WorkerRow[],
  error: Error | null = null,
  supply: unknown = readyJobSupply,
  supplyError: Error | null = null,
) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    schema: () => ({
      rpc: vi.fn(async (name: string) =>
        name === "get_job_supply_canary"
          ? { data: supply, error: supplyError }
          : { data, error },
      ),
    }),
  } as never);
}

describe("operational health", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(getServerEnvironment).mockReturnValue({ ...environment });
    vi.mocked(getSupabasePublicConfig).mockReturnValue({
      url: environment.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    vi.mocked(getAfroToolsConfig).mockReturnValue({
      baseUrl: environment.AFROTOOLS_API_BASE_URL,
      apiKey: environment.AFROTOOLS_API_KEY,
    });
    mockWorkerResult(healthyWorkers);
  });

  it("returns ready only when credentials, providers, and workers are healthy", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      status: "ok",
      checks: {
        backend_configured: true,
        worker_backend_configured: true,
        afrotools_configured: true,
        operations_configured: true,
        worker_health_complete: true,
        job_supply_ready: true,
        job_supply: {
          visible_remote_jobs: 1_200,
          target_daily_new_canonical: 500,
          authorized_daily_capacity: 650,
          state: "ready",
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain("test-service-role-key");
    expect(JSON.stringify(body)).not.toContain("test-resend-key");
  });

  it("returns 503 when an expected production provider is disabled", async () => {
    vi.mocked(getServerEnvironment).mockReturnValue({
      ...environment,
      EMAIL_PROVIDER: "none",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      checks: {
        operations_configured: false,
        providers_ready: { email: false },
      },
    });
  });

  it("treats an intentionally disabled Remotive gate as a safe source state", async () => {
    vi.mocked(getServerEnvironment).mockReturnValue({
      ...environment,
      REMOTIVE_SOURCE_ENABLED: false,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: {
        remotive_source_enabled: false,
        providers_ready: { source_policy_fail_closed: true },
      },
    });
  });

  it("returns 503 when a worker reports a degraded run", async () => {
    mockWorkerResult([
      {
        task_key: "alert_delivery",
        owner_label: "Test operations owner",
        last_status: "failed",
        last_started_at: "2026-07-10T12:00:00.000Z",
        last_success_at: "2026-07-10T11:00:00.000Z",
        freshness: "degraded",
      },
      ...healthyWorkers.slice(1),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("degraded");
  });

  it("rejects contradictory worker status and freshness evidence", async () => {
    mockWorkerResult([
      {
        ...healthyWorkers[0]!,
        last_status: "failed",
        freshness: "healthy",
      },
      ...healthyWorkers.slice(1),
    ]);

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "degraded",
      checks: { worker_health_complete: false, workers: [] },
    });
  });

  it("returns 503 and names an unknown task without losing worker visibility", async () => {
    // Regression: the production incident. An unregistered schedule row
    // (employer_feed_sync) failed the whole strict-enum array parse, so every
    // healthy worker vanished from the payload and the freshness workflow
    // reported all 27 as "missing". Drift must be named, not erased.
    mockWorkerResult([
      ...healthyWorkers,
      { ...healthyWorkers[0]!, task_key: "unreviewed_worker" },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      checks: {
        worker_health_complete: false,
        unregistered_workers: ["unreviewed_worker"],
        missing_workers: [],
      },
    });
    // The healthy workers are still reported, unlike before the fix.
    expect(body.checks.workers).toHaveLength(healthyWorkers.length + 1);
  });

  it("stays healthy when a REGISTERED worker is deliberately disabled", async () => {
    // employer_feed_sync is registered now that a worker ships for it. A
    // registered schedule reporting `disabled` is honest state, not a fault,
    // and it is not "parked" — parked means the registry does not know it.
    mockWorkerResult([
      {
        ...healthyWorkers[0]!,
        last_status: null,
        last_started_at: null,
        last_success_at: null,
        freshness: "disabled",
      },
      ...healthyWorkers.slice(1),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: {
        worker_health_complete: true,
        unregistered_workers: [],
        parked_workers: [],
        unhealthy_workers: [],
      },
    });
  });

  it("stays healthy when an UNREGISTERED schedule is parked ahead of its worker", async () => {
    // A schedule row this deployment has no worker for. Disabled, it asks
    // nothing of the platform, so it is reported as parked rather than failing
    // health — while an enabled unknown schedule still fails (below).
    mockWorkerResult([
      ...healthyWorkers,
      {
        task_key: "future_feed_sync",
        owner_label: "SalaryPadi ingestion operations",
        last_status: null,
        last_started_at: null,
        last_success_at: null,
        freshness: "disabled",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: {
        worker_health_complete: true,
        unregistered_workers: [],
        parked_workers: ["future_feed_sync"],
        unhealthy_workers: [],
      },
    });
  });

  it("names which registered workers the database omitted", async () => {
    mockWorkerResult(healthyWorkers.slice(0, 3));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.worker_health_complete).toBe(false);
    expect(body.checks.missing_workers).toEqual(EXPECTED_WORKER_KEYS.slice(3));
    expect(body.checks.workers).toHaveLength(3);
  });

  it("treats a deliberately disabled worker as complete and healthy", async () => {
    mockWorkerResult([
      {
        ...healthyWorkers[0]!,
        last_status: null,
        last_started_at: null,
        last_success_at: null,
        freshness: "disabled",
      },
      ...healthyWorkers.slice(1),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: { worker_health_complete: true, unhealthy_workers: [] },
    });
  });

  it("returns 503 when a registered worker has never run", async () => {
    mockWorkerResult([
      {
        ...healthyWorkers[0]!,
        last_status: null,
        last_started_at: null,
        last_success_at: null,
        freshness: "never",
      },
      ...healthyWorkers.slice(1),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.worker_health_complete).toBe(true);
    expect(body.checks.unhealthy_workers).toEqual([EXPECTED_WORKER_KEYS[0]]);
  });

  it("returns 503 when a registered worker is stale", async () => {
    mockWorkerResult([
      { ...healthyWorkers[0]!, freshness: "stale" },
      ...healthyWorkers.slice(1),
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.checks.unhealthy_workers).toEqual([EXPECTED_WORKER_KEYS[0]]);
  });

  it("returns 503 when worker timestamps are malformed", async () => {
    mockWorkerResult([
      { ...healthyWorkers[0]!, last_started_at: "not-a-timestamp" },
      ...healthyWorkers.slice(1),
    ]);

    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      status: "degraded",
      checks: { worker_health_complete: false, workers: [] },
    });
  });

  /**
   * Supply capacity is reported truthfully but does NOT drive the HTTP status.
   * `authorized_daily_capacity` sums recorded capacity evidence over runnable
   * source policies, so with sources intentionally unauthorised it is
   * legitimately 0 and no correct worker execution can raise it. The freshness
   * workflow asserts it as its own `supply:capacity` check
   * (scripts/verify-production-freshness.mjs), which is what keeps an
   * unauthorised supply base a visible failure.
   */
  it("reports zero eligible supply honestly without masking worker health", async () => {
    mockWorkerResult(healthyWorkers, null, {
      ...readyJobSupply,
      visible_remote_jobs: 0,
      authorized_daily_capacity: 0,
      last_canonical_created_at: null,
      state: "unavailable",
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ok",
      checks: {
        worker_health_complete: true,
        job_supply_ready: false,
        job_supply: {
          visible_remote_jobs: 0,
          target_daily_new_canonical: 500,
          authorized_daily_capacity: 0,
          state: "unavailable",
        },
      },
    });
  });

  it("never reports supply as ready while capacity is unproven", async () => {
    mockWorkerResult(healthyWorkers, null, {
      ...readyJobSupply,
      visible_remote_jobs: 216,
      authorized_daily_capacity: 0,
      state: "capacity_unproven",
    });

    const body = await (await GET()).json();
    expect(body.checks.job_supply_ready).toBe(false);
    expect(body.checks.job_supply.authorized_daily_capacity).toBe(0);
    expect(body.checks.job_supply.state).toBe("capacity_unproven");
  });

  it("rejects a canary that claims readiness without supply evidence", async () => {
    mockWorkerResult(healthyWorkers, null, {
      ...readyJobSupply,
      visible_remote_jobs: 0,
      authorized_daily_capacity: 0,
      last_canonical_created_at: null,
      state: "ready",
    });

    expect(await (await GET()).json()).toMatchObject({
      checks: {
        job_supply_ready: false,
        job_supply: { state: "unavailable" },
      },
    });
  });

  it("rejects canary evidence that postdates its generation time", async () => {
    mockWorkerResult(healthyWorkers, null, {
      ...readyJobSupply,
      last_canonical_created_at: "2026-07-10T12:05:02.001Z",
    });

    expect(await (await GET()).json()).toMatchObject({
      checks: { job_supply_ready: false },
    });
  });

  it("reports supply as not ready when evidence is absent or below capacity", async () => {
    mockWorkerResult(healthyWorkers, null, {
      ...readyJobSupply,
      authorized_daily_capacity: 100,
      state: "capacity_unproven",
    });
    expect((await (await GET()).json()).checks.job_supply_ready).toBe(false);

    mockWorkerResult(healthyWorkers, null, null, new Error("missing RPC"));
    expect(await (await GET()).json()).toMatchObject({
      checks: {
        job_supply_ready: false,
        job_supply: { state: "unavailable" },
      },
    });
  });

  it("returns a bounded degraded response when client creation throws", async () => {
    vi.mocked(createServerSupabaseClient).mockRejectedValue(
      new Error("client creation failed with secret detail"),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      checks: {
        worker_health_complete: false,
        job_supply_ready: false,
        job_supply: { state: "unavailable" },
      },
    });
    expect(JSON.stringify(body)).not.toContain("secret detail");
  });

  it("keeps independent RPC exceptions inside the degraded health contract", async () => {
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      schema: () => ({
        rpc: vi.fn().mockRejectedValue(new Error("rpc transport failed")),
      }),
    } as never);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      checks: {
        worker_health_complete: false,
        job_supply_ready: false,
        workers: [],
      },
    });
    expect(JSON.stringify(body)).not.toContain("rpc transport failed");
  });
});
