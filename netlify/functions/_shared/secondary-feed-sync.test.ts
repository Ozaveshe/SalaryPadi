import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeRemotiveJob } from "../../../src/lib/jobs/normalize";
import type { RemotiveJob } from "../../../src/lib/jobs/remotive-schema";
import type { SecondaryFeedSnapshotResult } from "../../../src/lib/jobs/secondary-feed-store";
import { AdapterPolicyError } from "../../../src/lib/jobs/supply/policy";

const mocks = vi.hoisted(() => ({
  openSupplyAdapter: vi.fn(),
}));

vi.mock("../../../src/lib/jobs/supply/adapters", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../../src/lib/jobs/supply/adapters")
    >();
  return { ...actual, openSupplyAdapter: mocks.openSupplyAdapter };
});

import { runSecondaryFeedSync } from "../secondary-feed-sync.mjs";
import { OperationalError, type WorkerExecution } from "./runtime";

const sourceJob: RemotiveJob = {
  id: 61,
  url: "https://remotive.com/remote-jobs/software-dev/source-61",
  title: "Backend Engineer",
  company_name: "Example Ltd",
  company_logo: null,
  category: "Software Development",
  tags: [],
  job_type: "full_time",
  publication_date: "2026-07-20T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "",
  description: "<p>Build APIs.</p>",
};

/**
 * The COMPLETE row api.worker_get_job_source_policy returns, copied from the
 * live production response.
 *
 * This fixture previously carried only the thirteen fields the worker asserts
 * on, while the function returns nineteen. Because the worker's row schema is
 * `.strict()`, the missing six made every real run fail with
 * `jobicy_source_policy_invalid` — but the tests passed, because the fixture
 * mirrored the wrong schema instead of the real RPC contract. Keep this shape
 * in step with the function's `returns table (...)` signature.
 */
const jobicyPolicy = {
  source_id: "f8a5669e-42b5-47c1-b35f-717ba6915ac0",
  adapter_key: "jobicy",
  source_name: "Jobicy public API",
  source_type: "permitted_api",
  status: "active",
  homepage_url: "https://jobicy.com/",
  terms_url: "https://jobicy.com/jobs-rss-feed",
  terms_reviewed_at: "2026-07-14T00:00:00+00:00",
  terms_reviewed_by: null,
  terms_version: "jobicy-public-feed-reviewed-2026-07-14",
  review_requested_at: null,
  attribution_required: true,
  attribution_text:
    "Source: Jobicy; preserve a clickable link to the returned Jobicy URL",
  allow_public_listing: true,
  may_store_full_description: false,
  may_index_jobs: false,
  may_emit_jobposting_schema: false,
  required_destination_kind: "source_url",
  refresh_interval_seconds: 21_600,
};

const himalayasPolicy = {
  ...jobicyPolicy,
  source_id: "b31c0f2e-6d54-4a71-9c88-1f0b5a2d7e34",
  adapter_key: "himalayas",
  source_name: "Himalayas public API",
  homepage_url: "https://himalayas.app/",
  terms_url: "https://himalayas.app/api",
  terms_reviewed_at: "2026-07-15T00:00:00+00:00",
  terms_version: "himalayas-public-api-reviewed-2026-07-15",
  attribution_text:
    "Source: Himalayas; preserve a clickable link to the returned Himalayas URL",
  refresh_interval_seconds: 86_400,
};

const reliefwebPolicy = {
  ...jobicyPolicy,
  source_id: "d949b1aa-93e3-46a0-b4fd-4e17bec0f37b",
  adapter_key: "reliefweb",
  source_name: "ReliefWeb jobs API",
  homepage_url: "https://reliefweb.int/jobs",
  terms_url: "https://apidoc.reliefweb.int/",
  terms_version: "reliefweb-api-terms-reviewed-2026-07-14",
  attribution_text:
    "Source: ReliefWeb and the named information partner; preserve the returned ReliefWeb URL",
};

const policiesByAdapter: Record<string, unknown[]> = {
  jobicy: [jobicyPolicy],
  himalayas: [himalayasPolicy],
  reliefweb: [reliefwebPolicy],
};

function execution(): WorkerExecution {
  return {
    signal: new AbortController().signal,
    remainingMs: () => 20_000,
  };
}

function policyRpc() {
  return vi.fn(async (name: string, parameters?: Record<string, unknown>) => {
    expect(name).toBe("worker_get_job_source_policy");
    return policiesByAdapter[String(parameters?.p_adapter_key)] ?? [];
  });
}

function feedJob(checkedAt: string) {
  return normalizeRemotiveJob(sourceJob, checkedAt);
}

const missing: SecondaryFeedSnapshotResult = { state: "missing" };

beforeEach(() => {
  vi.stubGlobal("Netlify", {
    context: { deploy: { context: "production" } },
    env: {
      get: (name: string) =>
        ({
          RELIEFWEB_SOURCE_ENABLED: "true",
          RELIEFWEB_APP_NAME: "salarypadi-test",
        })[name],
    },
  });
  mocks.openSupplyAdapter.mockReset();
  mocks.openSupplyAdapter.mockImplementation((key: string) => ({
    policy: { adapterKey: key },
    endpoint: `https://example.test/${key}`,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("secondary feed sync worker", () => {
  it("fetches and stores all secondary sources when no snapshot exists", async () => {
    const checkedAt = new Date().toISOString();
    const storeSnapshot = vi.fn(async (_source, jobs: unknown[]) =>
      Array.isArray(jobs) ? jobs.length : 0,
    );
    const result = await runSecondaryFeedSync(execution(), {
      rpc: policyRpc(),
      readSnapshot: async () => missing,
      storeSnapshot: storeSnapshot as never,
      fetchJobs: async () => ({ jobs: [feedJob(checkedAt)], checkedAt }),
    });

    expect(result.summary).toMatchObject({
      stored_count: 3,
      failed_count: 0,
    });
    expect(storeSnapshot).toHaveBeenCalledTimes(3);
    expect(storeSnapshot.mock.calls.map((call) => call[0])).toEqual([
      "jobicy",
      "himalayas",
      "reliefweb",
    ]);
  });

  it("skips a source whose snapshot is younger than its reviewed poll interval", async () => {
    const now = Date.now();
    const freshCheckedAt = new Date(now - 60 * 60 * 1_000).toISOString();
    const fetchJobs = vi.fn(async () => ({
      jobs: [feedJob(freshCheckedAt)],
      checkedAt: freshCheckedAt,
    }));
    const readSnapshot = vi.fn(
      async (): Promise<SecondaryFeedSnapshotResult> => ({
        state: "ready",
        catalog: {
          schemaVersion: 1,
          checkedAt: freshCheckedAt,
          jobs: [],
        },
      }),
    );

    const result = await runSecondaryFeedSync(execution(), {
      rpc: policyRpc(),
      readSnapshot,
      storeSnapshot: vi.fn() as never,
      fetchJobs,
      now: () => now,
    });

    // Jobicy (6h interval) is not due after 1h; Himalayas (24h) is not due
    // either — nothing is fetched, nothing overwritten.
    expect(result.summary).toMatchObject({
      stored_count: 0,
      skipped_count: 3,
      failed_count: 0,
    });
    expect(fetchJobs).not.toHaveBeenCalled();
  });

  it("fetches a source again once its snapshot passes the poll interval", async () => {
    const now = Date.now();
    const agedCheckedAt = new Date(now - 7 * 60 * 60 * 1_000).toISOString();
    const freshCheckedAt = new Date(now).toISOString();
    const fetchJobs = vi.fn(async (source: string) => {
      void source;
      return {
        jobs: [feedJob(freshCheckedAt)],
        checkedAt: freshCheckedAt,
      };
    });

    const result = await runSecondaryFeedSync(execution(), {
      rpc: policyRpc(),
      readSnapshot: async (source) => ({
        state: "ready",
        catalog: {
          schemaVersion: 1,
          checkedAt: source === "jobicy" ? agedCheckedAt : freshCheckedAt,
          jobs: [],
        },
      }),
      storeSnapshot: vi.fn(async () => 1) as never,
      fetchJobs,
      now: () => now,
    });

    // Only Jobicy is due; the other two snapshots are current.
    expect(fetchJobs).toHaveBeenCalledTimes(1);
    expect(fetchJobs.mock.calls[0]![0]).toBe("jobicy");
    expect(result.summary).toMatchObject({
      stored_count: 1,
      skipped_count: 2,
    });
  });

  it("keeps the previous snapshot when a provider returns an empty feed", async () => {
    const checkedAt = new Date().toISOString();
    const storeSnapshot = vi.fn();

    const result = await runSecondaryFeedSync(execution(), {
      rpc: policyRpc(),
      readSnapshot: async () => missing,
      storeSnapshot: storeSnapshot as never,
      fetchJobs: async (source) =>
        source === "jobicy"
          ? { jobs: [], checkedAt }
          : { jobs: [feedJob(checkedAt)], checkedAt },
    });

    expect(storeSnapshot).toHaveBeenCalledTimes(2);
    expect(result.summary).toMatchObject({
      stored_count: 2,
      failed_count: 1,
    });
  });

  it("fails closed when the policy contract grows an unrecognised column", async () => {
    // The row schema stays `.strict()` on purpose: an unknown column means the
    // policy contract moved and the worker must not sync against a shape it
    // does not understand. This is the guard that made the real incident fail
    // closed — correct behaviour on the wrong schema. Widening the declared
    // shape to the true 19 columns must not have weakened it.
    const checkedAt = new Date().toISOString();
    const storeSnapshot = vi.fn();
    const rpc = vi.fn(async (_name, parameters?: Record<string, unknown>) =>
      parameters?.p_adapter_key === "jobicy"
        ? [{ ...jobicyPolicy, unexpected_new_column: "surprise" }]
        : (policiesByAdapter[String(parameters?.p_adapter_key)] ?? []),
    );

    const result = await runSecondaryFeedSync(execution(), {
      rpc,
      readSnapshot: async () => missing,
      storeSnapshot: storeSnapshot as never,
      fetchJobs: async () => ({ jobs: [feedJob(checkedAt)], checkedAt }),
    });

    expect(result.summary).toMatchObject({
      jobicy_outcome: "failed",
      jobicy_code: "jobicy_source_policy_invalid",
      himalayas_outcome: "stored",
    });
  });

  it("accepts the complete production policy row for every source", async () => {
    // Regression: the fixture used to omit six columns the RPC really returns,
    // so `.strict()` rejected every live row and secondary_feed_sync failed on
    // every scheduled run while the unit tests stayed green.
    const checkedAt = new Date().toISOString();
    const storeSnapshot = vi.fn();

    const result = await runSecondaryFeedSync(execution(), {
      rpc: policyRpc(),
      readSnapshot: async () => missing,
      storeSnapshot: storeSnapshot as never,
      fetchJobs: async () => ({ jobs: [feedJob(checkedAt)], checkedAt }),
    });

    expect(result.summary).toMatchObject({
      jobicy_outcome: "stored",
      himalayas_outcome: "stored",
      reliefweb_outcome: "stored",
      failed_count: 0,
    });
  });

  it("refuses a live policy row that disagrees with the reviewed policy", async () => {
    const checkedAt = new Date().toISOString();
    const storeSnapshot = vi.fn();
    const rpc = vi.fn(async (_name, parameters?: Record<string, unknown>) =>
      parameters?.p_adapter_key === "jobicy"
        ? [{ ...jobicyPolicy, may_index_jobs: true }]
        : (policiesByAdapter[String(parameters?.p_adapter_key)] ?? []),
    );

    const result = await runSecondaryFeedSync(execution(), {
      rpc,
      readSnapshot: async () => missing,
      storeSnapshot: storeSnapshot as never,
      fetchJobs: async () => ({ jobs: [feedJob(checkedAt)], checkedAt }),
    });

    expect(result.summary).toMatchObject({
      jobicy_outcome: "failed",
      jobicy_code: "jobicy_policy_mismatch",
      himalayas_outcome: "stored",
    });
    expect(
      (storeSnapshot.mock.calls as unknown[][]).map((call) => call[0]),
    ).toEqual(["himalayas", "reliefweb"]);
  });

  it("skips a source the application registry has disabled", async () => {
    const checkedAt = new Date().toISOString();
    mocks.openSupplyAdapter.mockImplementation((key: string) => {
      if (key === "himalayas") {
        throw new AdapterPolicyError("policy_disabled", "himalayas");
      }
      return { policy: { adapterKey: key }, endpoint: "https://example.test" };
    });

    const result = await runSecondaryFeedSync(execution(), {
      rpc: policyRpc(),
      readSnapshot: async () => missing,
      storeSnapshot: vi.fn(async () => 1) as never,
      fetchJobs: async () => ({ jobs: [feedJob(checkedAt)], checkedAt }),
    });

    expect(result.summary).toMatchObject({
      himalayas_outcome: "skipped",
      himalayas_code: "himalayas_policy_disabled",
    });
  });

  it("fails loudly when every source fails", async () => {
    await expect(
      runSecondaryFeedSync(execution(), {
        rpc: policyRpc(),
        readSnapshot: async () => missing,
        storeSnapshot: vi.fn() as never,
        fetchJobs: async () => {
          throw new Error("provider_down");
        },
      }),
    ).rejects.toThrow(OperationalError);
  });

  it("never writes from a non-production deploy context", async () => {
    vi.stubGlobal("Netlify", {
      context: { deploy: { context: "deploy-preview" } },
    });
    const storeSnapshot = vi.fn();

    const result = await runSecondaryFeedSync(execution(), {
      rpc: policyRpc(),
      readSnapshot: async () => missing,
      storeSnapshot: storeSnapshot as never,
      fetchJobs: async () => ({
        jobs: [feedJob(new Date().toISOString())],
        checkedAt: new Date().toISOString(),
      }),
    });

    expect(result).toMatchObject({
      status: "skipped",
      summary: { reason: "secondary_feed_production_only" },
    });
    expect(storeSnapshot).not.toHaveBeenCalled();
  });
});
