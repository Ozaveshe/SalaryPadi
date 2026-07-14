import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/env", () => ({ getSupabasePublicConfig: vi.fn() }));

import { getSupabasePublicConfig } from "@/lib/env";
import {
  getAllJobLandingMetricsResults,
  getJobLandingMetricsResult,
} from "@/lib/seo/job-landing-repository";
import { JOB_LANDING_DEFINITIONS } from "@/lib/seo/job-landing-pages";
import { unstable_rethrow } from "next/navigation";

const mockedConfiguration = vi.mocked(getSupabasePublicConfig);

function validRow(landingKey = "remote_nigeria") {
  return {
    landing_key: landingKey,
    active_unique_jobs: 24,
    unique_jobs_seen_90_days: 42,
    company_count: 7,
    stable_demand_signal: true,
    last_modified: "2026-07-14T00:00:00.000Z",
    measured_at: "2026-07-14T01:00:00.000Z",
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(unstable_rethrow).mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedConfiguration.mockReturnValue({
    url: "https://bxelrhklsznmpksgrqep.supabase.co",
    publishableKey: "test-publishable-key",
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("job landing metrics repository", () => {
  it("distinguishes an unconfigured backend from measured zero demand", async () => {
    mockedConfiguration.mockReturnValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getJobLandingMetricsResult("remote_nigeria"),
    ).resolves.toMatchObject({
      state: "unconfigured",
      data: null,
      issues: [{ code: "job_landing_metrics_unconfigured" }],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns validated metrics and sends only the requested key", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(validRow()));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getJobLandingMetricsResult("remote_nigeria"),
    ).resolves.toMatchObject({
      state: "ready",
      data: {
        key: "remote_nigeria",
        activeUniqueJobs: 24,
        uniqueJobsSeen90Days: 42,
        companyCount: 7,
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(
        "https://bxelrhklsznmpksgrqep.supabase.co/rest/v1/rpc/job_landing_page_metrics",
      ),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ p_landing_key: "remote_nigeria" }),
      }),
    );
  });

  it("preserves an HTTP failure as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({}, { status: 503 })),
    );

    await expect(
      getJobLandingMetricsResult("remote_nigeria"),
    ).resolves.toMatchObject({
      state: "unavailable",
      data: null,
      issues: [{ code: "job_landing_metrics_503" }],
    });
  });

  it("preserves invalid JSON as invalid evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response("not json", {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      getJobLandingMetricsResult("remote_nigeria"),
    ).resolves.toMatchObject({
      state: "invalid",
      data: null,
      issues: [{ code: "job_landing_metrics_invalid_json" }],
    });
  });

  it.each([
    ["an empty result", []],
    ["multiple rows", [validRow(), validRow()]],
    ["a mismatched landing key", validRow("city_lagos")],
    ["invalid counters", { ...validRow(), active_unique_jobs: -1 }],
    ["an impossible company count", { ...validRow(), company_count: 25 }],
    [
      "active jobs without companies",
      { ...validRow(), active_unique_jobs: 1, company_count: 0 },
    ],
    [
      "an invalid measurement timestamp",
      { ...validRow(), measured_at: "soon" },
    ],
    [
      "modification evidence after measurement",
      {
        ...validRow(),
        last_modified: "2026-07-14T01:05:00.001Z",
      },
    ],
    ["an unknown response field", { ...validRow(), unreviewed_count: 1 }],
  ])(
    "rejects %s instead of fabricating zero metrics",
    async (_label, payload) => {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(payload)),
      );

      await expect(
        getJobLandingMetricsResult("remote_nigeria"),
      ).resolves.toMatchObject({
        state: "invalid",
        data: null,
        issues: [{ code: "job_landing_metrics_invalid_row" }],
      });
    },
  );

  it("rejects a future measurement clock", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json({
          ...validRow(),
          measured_at: "2026-07-14T02:05:00.001Z",
        }),
      ),
    );

    await expect(
      getJobLandingMetricsResult(
        "remote_nigeria",
        new Date("2026-07-14T02:00:00.000Z"),
      ),
    ).resolves.toMatchObject({
      state: "invalid",
      issues: [{ code: "job_landing_metrics_invalid_row" }],
    });
  });

  it("maps an ordinary transport failure to unavailable", async () => {
    const failure = new Error("metrics transport failed");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(failure));

    await expect(
      getJobLandingMetricsResult("remote_nigeria"),
    ).resolves.toMatchObject({
      state: "unavailable",
      issues: [{ code: "job_landing_metrics_query_failed" }],
    });
    expect(unstable_rethrow).toHaveBeenCalledWith(failure);
  });

  it("does not swallow framework-controlled request errors", async () => {
    const frameworkError = new Error("next framework signal");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockRejectedValue(frameworkError),
    );
    vi.mocked(unstable_rethrow).mockImplementationOnce((error) => {
      throw error;
    });

    await expect(getJobLandingMetricsResult("remote_nigeria")).rejects.toBe(
      frameworkError,
    );
  });

  it("reads every configured landing key independently", async () => {
    const fetchMock = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { p_landing_key: string };
      return Response.json(validRow(body.p_landing_key));
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await getAllJobLandingMetricsResults();

    expect(results).toHaveLength(JOB_LANDING_DEFINITIONS.length);
    expect(results.every((result) => result.state === "ready")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(JOB_LANDING_DEFINITIONS.length);
  });
});
