import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { createServerSupabaseClient } from "@/lib/supabase/server";

const environment = {
  NEXT_PUBLIC_APP_URL: "https://salarypadi.com",
  NEXT_PUBLIC_SUPABASE_URL: "https://bxelrhklsznmpksgrqep.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-publishable-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  JOB_SOURCE_SYNC_TOKEN: "test-source-sync-token",
  AFROTOOLS_API_BASE: "https://afrotools.com/api/v1",
  AFROTOOLS_API_KEY: "test-afrotools-key",
  RESEND_API_KEY: "test-resend-key",
  TRANSACTIONAL_EMAIL_FROM: "SalaryPadi <updates@mail.salarypadi.com>",
  TRANSACTIONAL_EMAIL_REPLY_TO: "support@salarypadi.com",
  REMOTIVE_SOURCE_ENABLED: true,
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

const healthyWorkers: WorkerRow[] = [
  "alert_delivery",
  "currency_rates",
  "job_source_sync",
  "operations_maintenance",
].map((taskKey) => ({
  task_key: taskKey,
  owner_label: "Test operations owner",
  last_status: "succeeded",
  last_started_at: "2026-07-10T12:00:00.000Z",
  last_success_at: "2026-07-10T12:00:01.000Z",
  freshness: "healthy",
}));

function mockWorkerResult(data: WorkerRow[], error: Error | null = null) {
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    schema: () => ({ rpc: vi.fn().mockResolvedValue({ data, error }) }),
  } as never);
}

describe("operational health", () => {
  beforeEach(() => {
    vi.mocked(getServerEnvironment).mockReturnValue({ ...environment });
    vi.mocked(getSupabasePublicConfig).mockReturnValue({
      url: environment.NEXT_PUBLIC_SUPABASE_URL,
      publishableKey: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    vi.mocked(getAfroToolsConfig).mockReturnValue({
      baseUrl: environment.AFROTOOLS_API_BASE,
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

  it("returns 503 when the database omits a required worker", async () => {
    mockWorkerResult(healthyWorkers.slice(0, 3));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      status: "degraded",
      checks: { worker_health_complete: false },
    });
  });
});
