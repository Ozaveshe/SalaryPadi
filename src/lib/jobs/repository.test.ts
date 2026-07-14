import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildJobFingerprint, normalizeRemotiveJob } from "./normalize";
import { buildJobFingerprintLookupKeys } from "./fingerprint";
import type { RemotiveJob } from "./remotive-schema";
import { REMOTIVE_CACHE_TAG } from "./source-policy";
import type { Job } from "./types";

const mocks = vi.hoisted(() => ({
  environment: vi.fn(),
  publicConfig: vi.fn(),
  createClient: vi.fn(),
  fetchRemotiveJobs: vi.fn(),
  fetchJobicyJobs: vi.fn(),
  fetchHimalayasJobs: vi.fn(),
  decodeDatabaseJobRow: vi.fn(),
  openSupplyAdapter: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/env", () => ({
  getServerEnvironment: mocks.environment,
  getSupabasePublicConfig: mocks.publicConfig,
}));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: mocks.createClient,
}));
vi.mock("./remotive-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./remotive-adapter")>();
  return { ...actual, fetchRemotiveJobs: mocks.fetchRemotiveJobs };
});
vi.mock("./jobicy-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./jobicy-adapter")>();
  return { ...actual, fetchJobicyJobs: mocks.fetchJobicyJobs };
});
vi.mock("./himalayas-adapter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./himalayas-adapter")>();
  return { ...actual, fetchHimalayasJobs: mocks.fetchHimalayasJobs };
});
vi.mock("./database", () => ({
  decodeDatabaseJobRow: mocks.decodeDatabaseJobRow,
}));
vi.mock("./supply/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./supply/adapters")>();
  return { ...actual, openSupplyAdapter: mocks.openSupplyAdapter };
});

import {
  getDatabaseJobBySlugResult,
  getHimalayasJobFeed,
  getJobicyJobFeed,
  getJobBySlug,
  getLiveJobFeed,
  getRemotiveJobFeed,
} from "./repository";
import { unstable_rethrow } from "next/navigation";

const sourceJob: RemotiveJob = {
  id: 77,
  url: "https://remotive.com/remote-jobs/software-dev/source-77",
  title: "Platform Engineer",
  company_name: "Example Ltd",
  company_logo: null,
  category: "Software Development",
  tags: ["TypeScript"],
  job_type: "full_time",
  publication_date: "2026-07-09T09:00:00Z",
  candidate_required_location: "Worldwide",
  salary: "$80,000",
  description: "<p>Build reliable systems.</p>",
};

const checkedAt = "2026-07-10T13:05:00.000Z";

type ClientOptions = {
  policy?: Record<string, unknown> | null;
  jobicyPolicy?: Record<string, unknown> | null;
  himalayasPolicy?: Record<string, unknown> | null;
  policyError?: boolean;
  policyThrows?: boolean;
};

let databaseRows: unknown[] = [];
let databaseStatus = 200;
let databaseThrows = false;
let databaseRowsForRequest: ((url: URL) => unknown[]) | null = null;

function client({
  policy = {
    adapter_key: "remotive",
    source_type: "permitted_api",
    terms_url: "https://remotive.com/terms-of-use",
    terms_reviewed_at: "2026-07-14T00:00:00+00:00",
    terms_version: "remotive-terms-conflict-reviewed-2026-07-14",
    attribution_required: true,
    may_store_full_description: false,
    may_index_jobs: false,
    may_emit_jobposting_schema: false,
    allow_public_listing: true,
    required_destination_kind: "source_url",
    refresh_interval_seconds: 21_600,
  },
  policyError = false,
  policyThrows = false,
  jobicyPolicy = {
    adapter_key: "jobicy",
    source_type: "permitted_api",
    terms_url: "https://jobicy.com/jobs-rss-feed",
    terms_reviewed_at: "2026-07-14T00:00:00+00:00",
    terms_version: "jobicy-public-feed-reviewed-2026-07-14",
    attribution_required: true,
    may_store_full_description: false,
    may_index_jobs: false,
    may_emit_jobposting_schema: false,
    allow_public_listing: true,
    required_destination_kind: "source_url",
    refresh_interval_seconds: 21_600,
  },
  himalayasPolicy = {
    adapter_key: "himalayas",
    source_type: "permitted_api",
    terms_url: "https://himalayas.app/api",
    terms_reviewed_at: "2026-07-15T00:00:00+00:00",
    terms_version: "himalayas-public-api-reviewed-2026-07-15",
    attribution_required: true,
    may_store_full_description: false,
    may_index_jobs: false,
    may_emit_jobposting_schema: false,
    allow_public_listing: true,
    required_destination_kind: "source_url",
    refresh_interval_seconds: 86_400,
  },
}: ClientOptions = {}) {
  return {
    schema: () => ({
      from: (name: string) => {
        if (name === "job_sources") {
          return {
            select: () => ({
              eq: (_column: string, adapterKey: string) => ({
                abortSignal: () => ({
                  maybeSingle: async () => {
                    if (policyThrows)
                      throw new Error("policy transport failed");
                    return {
                      data:
                        adapterKey === "jobicy"
                          ? jobicyPolicy
                          : adapterKey === "himalayas"
                            ? himalayasPolicy
                            : policy,
                      error: policyError ? new Error("policy failed") : null,
                    };
                  },
                }),
              }),
            }),
          };
        }
        throw new Error(`Unexpected table ${name}`);
      },
    }),
  };
}

function remotiveJob(): Job {
  return normalizeRemotiveJob(sourceJob, checkedAt);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-10T13:10:00.000Z"));
  mocks.environment.mockReturnValue({
    REMOTIVE_SOURCE_ENABLED: true,
    JOB_SOURCE_SYNC_TOKEN: "test-source-sync-token-0000000000000000",
    NEXT_PUBLIC_APP_URL: "https://salarypadi.com",
    NODE_ENV: "production",
  });
  mocks.publicConfig.mockReturnValue({
    url: "https://bxelrhklsznmpksgrqep.supabase.co",
    publishableKey: "test-publishable-key",
  });
  databaseRows = [];
  databaseStatus = 200;
  databaseThrows = false;
  databaseRowsForRequest = null;
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>(async (input) => {
      if (!String(input).includes("/rest/v1/jobs")) {
        throw new Error(`Unexpected fetch ${String(input)}`);
      }
      if (databaseThrows) throw new Error("database jobs failed");
      const rows = databaseRowsForRequest
        ? databaseRowsForRequest(new URL(String(input)))
        : databaseRows;
      return Response.json(rows, { status: databaseStatus });
    }),
  );
  mocks.fetchRemotiveJobs.mockReset();
  mocks.fetchJobicyJobs.mockReset();
  mocks.fetchHimalayasJobs.mockReset();
  mocks.openSupplyAdapter.mockReset();
  mocks.openSupplyAdapter.mockReturnValue({
    policy: { adapterKey: "remotive" },
    endpoint: "https://remotive.com/api/remote-jobs",
  });
  mocks.decodeDatabaseJobRow.mockReset();
  mocks.decodeDatabaseJobRow.mockImplementation((row) => ({
    ok: true,
    job: row as Job,
  }));
  mocks.createClient.mockReset();
  vi.mocked(unstable_rethrow).mockReset();
  mocks.fetchRemotiveJobs.mockResolvedValue({
    jobs: [remotiveJob()],
    checkedAt,
  });
  mocks.fetchJobicyJobs.mockResolvedValue({ jobs: [], checkedAt });
  mocks.fetchHimalayasJobs.mockResolvedValue({
    jobs: [],
    checkedAt,
    partial: false,
    successfulRequestCount: 3,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("job feed source orchestration", () => {
  it("checks the live Himalayas policy and applies the daily cache contract", async () => {
    const result = await getHimalayasJobFeed(client() as never);

    expect(result).toMatchObject({
      key: "himalayas",
      state: "live",
      jobs: [],
    });
    expect(mocks.fetchHimalayasJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        requestInit: {
          next: {
            revalidate: 86_400,
            tags: ["salarypadi-job-source-himalayas"],
          },
        },
      }),
    );
  });

  it("surfaces a partial Himalayas page set without discarding valid jobs", async () => {
    mocks.fetchHimalayasJobs.mockResolvedValueOnce({
      jobs: [remotiveJob()],
      checkedAt,
      partial: true,
      successfulRequestCount: 2,
    });

    const result = await getHimalayasJobFeed(client() as never);

    expect(result).toMatchObject({
      key: "himalayas",
      state: "degraded",
      count: 1,
      code: "himalayas_partial_snapshot",
    });
  });

  it("does not contact Jobicy when its application policy is disabled", async () => {
    const { AdapterPolicyError } = await import("./supply/policy");
    mocks.openSupplyAdapter.mockImplementationOnce(() => {
      throw new AdapterPolicyError("policy_disabled", "jobicy");
    });

    const result = await getJobicyJobFeed(client() as never);

    expect(result).toMatchObject({
      key: "jobicy",
      state: "disabled",
      code: "jobicy_policy_disabled",
      jobs: [],
    });
    expect(mocks.fetchJobicyJobs).not.toHaveBeenCalled();
  });

  it("checks the live Jobicy policy and applies the six-hour cache contract", async () => {
    const result = await getJobicyJobFeed(client() as never);

    expect(result).toMatchObject({ key: "jobicy", state: "live", jobs: [] });
    expect(mocks.fetchJobicyJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        requestInit: {
          next: {
            revalidate: 21_600,
            tags: ["salarypadi-job-source-jobicy"],
          },
        },
      }),
    );
  });

  it("fails closed when the live Jobicy policy is paused", async () => {
    const result = await getJobicyJobFeed(
      client({ jobicyPolicy: null }) as never,
    );

    expect(result).toMatchObject({
      key: "jobicy",
      state: "disabled",
      code: "jobicy_policy_disabled",
      jobs: [],
    });
    expect(mocks.fetchJobicyJobs).not.toHaveBeenCalled();
  });

  it("does not read the live registry or contact Remotive when the application policy is disabled", async () => {
    const { AdapterPolicyError } = await import("./supply/policy");
    mocks.openSupplyAdapter.mockImplementationOnce(() => {
      throw new AdapterPolicyError("policy_disabled", "remotive");
    });
    const liveClient = client();

    const result = await getRemotiveJobFeed(liveClient as never);

    expect(result).toMatchObject({
      state: "disabled",
      code: "remotive_policy_disabled",
      jobs: [],
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("does not contact Remotive when the authoritative public policy is paused", async () => {
    const result = await getRemotiveJobFeed(client({ policy: null }) as never);

    expect(result).toMatchObject({
      state: "disabled",
      code: "remotive_policy_disabled",
      jobs: [],
    });
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("fails closed when the public source cadence drifts from the reviewed contract", async () => {
    const result = await getRemotiveJobFeed(
      client({
        policy: {
          adapter_key: "remotive",
          source_type: "permitted_api",
          terms_url: "https://remotive.com/terms-of-use",
          terms_reviewed_at: "2026-07-14T00:00:00+00:00",
          terms_version: "remotive-terms-conflict-reviewed-2026-07-14",
          attribution_required: true,
          may_store_full_description: false,
          may_index_jobs: false,
          may_emit_jobposting_schema: false,
          allow_public_listing: true,
          required_destination_kind: "source_url",
          refresh_interval_seconds: 3_600,
        },
      }) as never,
    );

    expect(result).toMatchObject({
      state: "unavailable",
      code: "remotive_policy_mismatch",
    });
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("fails closed when the live source policy has an invalid row shape", async () => {
    const result = await getRemotiveJobFeed(
      client({
        policy: {
          adapter_key: "remotive",
          source_type: "permitted_api",
          terms_url: "http://remotive.com/terms-of-use",
          terms_reviewed_at: "not-a-timestamp",
          terms_version: "remotive-terms-conflict-reviewed-2026-07-14",
          attribution_required: true,
          may_store_full_description: false,
          may_index_jobs: false,
          may_emit_jobposting_schema: false,
          allow_public_listing: true,
          required_destination_kind: "source_url",
          refresh_interval_seconds: "21600",
        },
      }) as never,
    );

    expect(result).toMatchObject({
      state: "unavailable",
      code: "remotive_policy_invalid",
    });
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("routes cache misses through the authenticated budgeted source proxy", async () => {
    const proxyResponse = Response.json({ jobs: [] });
    const fetchSpy = vi.fn<typeof fetch>().mockResolvedValue(proxyResponse);
    vi.stubGlobal("fetch", fetchSpy);
    mocks.fetchRemotiveJobs.mockImplementationOnce(
      async (options: { fetch?: typeof fetch }) => {
        await options.fetch?.("https://remotive.com/api/remote-jobs", {
          headers: { Accept: "application/json" },
        });
        return { jobs: [remotiveJob()], checkedAt };
      },
    );

    const result = await getRemotiveJobFeed(client() as never);

    expect(result.state).toBe("live");
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://salarypadi.com/api/internal/remotive-source",
    );
    expect(new Headers(init?.headers).get("authorization")).toBe(
      "Bearer test-source-sync-token-0000000000000000",
    );
    expect(init).toMatchObject({
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
    });
  });

  it("does not relabel an over-age cached response as live", async () => {
    mocks.fetchRemotiveJobs.mockResolvedValueOnce({
      jobs: [remotiveJob()],
      checkedAt: new Date(Date.now() - 15 * 60 * 60 * 1_000).toISOString(),
    });

    const result = await getRemotiveJobFeed(client() as never);

    expect(result).toMatchObject({
      state: "unavailable",
      code: "remotive_snapshot_stale",
      jobs: [],
    });
  });

  it("reports a partial database outage instead of silently claiming full health", async () => {
    databaseThrows = true;
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getLiveJobFeed();

    expect(result.state).toBe("degraded");
    expect(result.jobs).toHaveLength(1);
    expect(result.message).toContain(
      "Reviewed employer jobs are temporarily unavailable.",
    );
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        key: "database",
        state: "unavailable",
        code: "database_jobs_query_failed",
      }),
    );
  });

  it("preserves the database feed when the source registry client fails", async () => {
    const failure = new Error("registry client failed");
    databaseRows = [remotiveJob()];
    mocks.createClient.mockRejectedValue(failure);

    const result = await getLiveJobFeed();

    expect(result.state).toBe("degraded");
    expect(result.jobs).toHaveLength(1);
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        key: "remotive",
        state: "unavailable",
        code: "source_registry_client_failed",
      }),
    );
    expect(result.sources).toContainEqual(
      expect.objectContaining({ key: "database", state: "live", count: 1 }),
    );
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("preserves the database feed when the policy transport throws", async () => {
    databaseRows = [remotiveJob()];
    mocks.createClient.mockResolvedValue(
      client({ policyThrows: true }) as never,
    );

    const result = await getLiveJobFeed();

    expect(result.state).toBe("degraded");
    expect(result.jobs).toHaveLength(1);
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        key: "remotive",
        state: "unavailable",
        code: "source_registry_query_failed",
      }),
    );
    expect(unstable_rethrow).toHaveBeenCalledWith(expect.any(Error));
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("does not swallow framework-controlled errors during source setup", async () => {
    const frameworkError = new Error("next framework signal");
    mocks.createClient.mockRejectedValue(frameworkError);
    vi.mocked(unstable_rethrow).mockImplementationOnce((reason) => {
      throw reason;
    });

    await expect(getLiveJobFeed()).rejects.toBe(frameworkError);
  });

  it("quarantines invalid database rows and exposes the degraded count", async () => {
    databaseRows = [{ invalid: true }];
    mocks.createClient.mockResolvedValue(client() as never);
    mocks.decodeDatabaseJobRow.mockReturnValue({
      ok: false,
      code: "database_job_contract_invalid",
      issuePaths: ["title"],
    });

    const result = await getLiveJobFeed();

    expect(result.state).toBe("degraded");
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        key: "database",
        state: "degraded",
        code: "database_jobs_invalid_rows",
        count: 0,
      }),
    );
  });

  it("marks the reviewed-job feed degraded when its capacity is exceeded", async () => {
    const employer = remotiveJob();
    databaseRows = Array.from({ length: 501 }, (_, index) => ({
      ...employer,
      id: `30000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }));
    mocks.createClient.mockResolvedValue(client() as never);
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await getLiveJobFeed();

    expect(result.sources).toContainEqual(
      expect.objectContaining({
        key: "database",
        state: "degraded",
        code: "database_jobs_capacity_exceeded",
        count: 500,
      }),
    );
    const databaseUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(databaseUrl.searchParams.get("limit")).toBe("501");
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('"code":"database_jobs_capacity_exceeded"'),
    );
  });

  it("quarantines duplicate database job identities", async () => {
    const employer = remotiveJob();
    databaseRows = [employer, employer];
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getLiveJobFeed();

    expect(result.sources).toContainEqual(
      expect.objectContaining({
        key: "database",
        state: "degraded",
        code: "database_jobs_duplicate_rows",
        count: 1,
      }),
    );
  });

  it("lets a reviewed employer record win an exact-destination collision", async () => {
    const remote = remotiveJob();
    const employerDestination = `${remote.applicationUrl}?utm_source=ats&ref=feed`;
    const employer: Job = {
      ...remote,
      id: "00000000-0000-4000-8000-000000000077",
      databaseId: "00000000-0000-4000-8000-000000000077",
      slug: "platform-engineer-at-example-ltd",
      applicationUrl: employerDestination,
      sourceUrl: employerDestination,
      source: {
        ...remote.source,
        id: "00000000-0000-4000-8000-000000000078",
        name: "Example employer submission",
        type: "employer",
      },
      fingerprint: buildJobFingerprint({
        title: remote.title,
        company: remote.company.name,
        location: remote.locationDisplay,
        arrangement: remote.arrangement,
        destination: employerDestination,
      }),
    };
    databaseRows = [employer];
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getLiveJobFeed();

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toMatchObject({
      id: employer.id,
      source: { type: "employer" },
    });
  });

  it("does not collapse two openings with the same title and employer", async () => {
    const remote = remotiveJob();
    const distinctEmployer: Job = {
      ...remote,
      id: "00000000-0000-4000-8000-000000000079",
      databaseId: "00000000-0000-4000-8000-000000000079",
      slug: "platform-engineer-at-example-ltd-local",
      applicationUrl: "https://jobs.example.test/openings/456",
      sourceUrl: "https://jobs.example.test/openings/456",
      source: {
        ...remote.source,
        id: "00000000-0000-4000-8000-000000000080",
        name: "Example employer submission",
        type: "employer",
      },
      fingerprint: buildJobFingerprint({
        title: remote.title,
        company: remote.company.name,
        location: remote.locationDisplay,
        arrangement: remote.arrangement,
        destination: "https://jobs.example.test/openings/456",
      }),
    };
    databaseRows = [distinctEmployer];
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getLiveJobFeed();

    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.map(({ id }) => id)).toContain(remote.id);
    expect(result.jobs.map(({ id }) => id)).toContain(distinctEmployer.id);
  });

  it("never publishes remote roles restricted to non-African applicants", async () => {
    const restricted: Job = {
      ...remotiveJob(),
      locationDisplay: "Remote - United States",
      eligibility: {
        ...remotiveJob().eligibility,
        scope: "named_countries",
        nigeria: "not_eligible",
        africa: "not_eligible",
        includedCountries: ["United States"],
        evidenceText: "Remote - United States",
      },
    };
    mocks.fetchRemotiveJobs.mockResolvedValueOnce({
      jobs: [restricted],
      checkedAt,
    });
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getLiveJobFeed();

    expect(result.jobs).toEqual([]);
    expect(result.sources).toContainEqual(
      expect.objectContaining({ key: "remotive", state: "live", count: 0 }),
    );
  });

  it("resolves a stable alert ID as well as a display slug", async () => {
    mocks.createClient.mockResolvedValue(client() as never);

    const byId = await getJobBySlug("remotive-77");
    const bySlug = await getJobBySlug(remotiveJob().slug);

    expect(byId.job?.id).toBe("remotive-77");
    expect(bySlug.job?.id).toBe("remotive-77");
  });

  it("resolves a database slug directly without loading Remotive", async () => {
    const remote = remotiveJob();
    const employer: Job = {
      ...remote,
      id: "00000000-0000-4000-8000-000000000077",
      databaseId: "00000000-0000-4000-8000-000000000077",
      slug: "platform-engineer-at-example-ltd-direct",
      workMode: "hybrid",
      source: {
        ...remote.source,
        id: "00000000-0000-4000-8000-000000000078",
        name: "Example employer submission",
        type: "employer",
      },
    };
    databaseRows = [employer];

    const result = await getJobBySlug(employer.slug);

    expect(result.job).toEqual(employer);
    expect(result.feed).toMatchObject({ state: "live", jobs: [employer] });
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
    const lookupUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(lookupUrl.searchParams.get("slug")).toBe(`eq.${employer.slug}`);
    expect(lookupUrl.searchParams.get("limit")).toBe("2");
    expect(lookupUrl.searchParams.has("order")).toBe(false);
  });

  it("does not return an expired database detail even if the public view leaks it", async () => {
    const employer: Job = {
      ...remotiveJob(),
      id: "00000000-0000-4000-8000-000000000077",
      databaseId: "00000000-0000-4000-8000-000000000077",
      slug: "expired-platform-engineer-at-example-ltd",
      validThrough: "2026-07-10T12:00:00.000Z",
      source: {
        ...remotiveJob().source,
        type: "employer",
      },
    };
    databaseRows = [employer];

    const result = await getJobBySlug(employer.slug);

    expect(result.job).toBeNull();
    expect(result.feed).toMatchObject({ state: "live", jobs: [] });
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("supports a direct database UUID lookup", async () => {
    const remote = remotiveJob();
    const employer: Job = {
      ...remote,
      id: "00000000-0000-4000-8000-000000000077",
      databaseId: "00000000-0000-4000-8000-000000000077",
      slug: "platform-engineer-at-example-ltd-direct",
      source: {
        ...remote.source,
        type: "employer",
      },
    };
    databaseRows = [employer];

    const result = await getDatabaseJobBySlugResult(employer.id);

    expect(result).toMatchObject({ state: "ready", data: employer });
    const lookupUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(lookupUrl.searchParams.get("or")).toBe(
      `(slug.eq.${employer.id},id.eq.${employer.id})`,
    );
  });

  it("preserves a degraded state for duplicate direct job rows", async () => {
    const employer: Job = {
      ...remotiveJob(),
      id: "00000000-0000-4000-8000-000000000077",
      databaseId: "00000000-0000-4000-8000-000000000077",
      slug: "platform-engineer-at-example-ltd-direct",
    };
    databaseRows = [employer, employer];

    await expect(
      getDatabaseJobBySlugResult(employer.id),
    ).resolves.toMatchObject({
      state: "degraded",
      data: employer,
      issues: [{ code: "database_jobs_duplicate_rows" }],
    });
  });

  it("preserves the unconfigured state for a direct database lookup", async () => {
    mocks.publicConfig.mockReturnValue(null);

    const result = await getDatabaseJobBySlugResult("missing-job-slug");

    expect(result).toMatchObject({
      state: "unconfigured",
      data: null,
      issues: [{ code: "database_unconfigured" }],
    });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("preserves the unavailable state for a failed direct database lookup", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    databaseThrows = true;

    const result = await getDatabaseJobBySlugResult("missing-job-slug");

    expect(result).toMatchObject({
      state: "unavailable",
      data: null,
      issues: [{ code: "database_jobs_query_failed" }],
    });
  });

  it("preserves the invalid state for a malformed direct response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ unexpected: true })),
    );

    const result = await getDatabaseJobBySlugResult("missing-job-slug");

    expect(result).toMatchObject({
      state: "invalid",
      data: null,
      issues: [{ code: "database_jobs_shape" }],
    });
  });

  it("returns a ready not-found result without scanning the database catalog", async () => {
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getJobBySlug("missing-job-slug");

    expect(result.job).toBeNull();
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    const lookupUrl = new URL(String(vi.mocked(fetch).mock.calls[0]?.[0]));
    expect(lookupUrl.searchParams.get("slug")).toBe("eq.missing-job-slug");
    expect(lookupUrl.searchParams.get("limit")).toBe("2");
  });

  it("keeps the Remotive cache tag on database misses", async () => {
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getJobBySlug(remotiveJob().slug);

    expect(result.job?.id).toBe("remotive-77");
    expect(mocks.fetchRemotiveJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        requestInit: expect.objectContaining({
          next: expect.objectContaining({ tags: [REMOTIVE_CACHE_TAG] }),
        }),
      }),
    );
  });

  it("surfaces invalid direct rows as a degraded Remotive fallback", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    databaseRows = [{ invalid: true }];
    mocks.decodeDatabaseJobRow.mockReturnValue({
      ok: false,
      code: "database_job_contract_invalid",
      issuePaths: ["title"],
    });
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getJobBySlug("remotive-77");

    expect(result.job?.id).toBe("remotive-77");
    expect(result.feed.state).toBe("degraded");
    expect(result.feed.sources).toContainEqual(
      expect.objectContaining({
        key: "database",
        state: "degraded",
        code: "database_jobs_invalid_rows",
      }),
    );
  });

  it("does not resurface a Remotive slug owned by a database collision", async () => {
    const remote = remotiveJob();
    const employer: Job = {
      ...remote,
      id: "00000000-0000-4000-8000-000000000077",
      databaseId: "00000000-0000-4000-8000-000000000077",
      slug: "platform-engineer-at-example-ltd-direct",
      source: {
        ...remote.source,
        id: "00000000-0000-4000-8000-000000000078",
        name: "Example employer submission",
        type: "employer",
      },
    };
    databaseRowsForRequest = (url) =>
      url.searchParams.has("dedup_fingerprint") ? [employer] : [];
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getJobBySlug(remote.slug);

    expect(result.job).toBeNull();
    expect(result.feed.jobs).toEqual([employer]);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    const collisionUrl = new URL(String(vi.mocked(fetch).mock.calls[1]?.[0]));
    const fingerprintKeys = buildJobFingerprintLookupKeys({
      title: remote.title,
      company: remote.company.name,
      location: remote.locationDisplay,
      arrangement: remote.arrangement,
      destination: remote.applicationUrl,
    });
    expect(collisionUrl.searchParams.get("dedup_fingerprint")).toBe(
      `in.(${fingerprintKeys.join(",")})`,
    );
    expect(collisionUrl.searchParams.get("limit")).toBe("10");
  });

  it("fails closed before provider acquisition when policy lookup fails", async () => {
    mocks.createClient.mockResolvedValue(
      client({ policyError: true }) as never,
    );

    const result = await getLiveJobFeed();

    expect(result.state).toBe("unavailable");
    expect(result.sources).toContainEqual(
      expect.objectContaining({
        key: "remotive",
        code: "source_registry_query_failed",
      }),
    );
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("explains an environment-disabled source when no reviewed jobs exist", async () => {
    mocks.environment.mockReturnValue({
      REMOTIVE_SOURCE_ENABLED: false,
      JOB_SOURCE_SYNC_TOKEN: "test-source-sync-token-0000000000000000",
      NEXT_PUBLIC_APP_URL: "https://salarypadi.com",
      NODE_ENV: "production",
    });
    mocks.createClient.mockResolvedValue(client() as never);

    const result = await getRemotiveJobFeed();

    expect(result).toMatchObject({
      state: "disabled",
      jobs: [],
      message: "The reviewed Remotive source is disabled in this environment.",
    });
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });

  it("explains a policy-paused source when no reviewed jobs exist", async () => {
    mocks.createClient.mockResolvedValue(client({ policy: null }) as never);

    const result = await getRemotiveJobFeed();

    expect(result).toMatchObject({
      state: "disabled",
      jobs: [],
      message: "The reviewed Remotive source is paused or disabled.",
    });
    expect(mocks.fetchRemotiveJobs).not.toHaveBeenCalled();
  });
});
