import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/companies/repository", () => ({
  getCompaniesResult: vi.fn(),
  getPublishedCompanyEvidenceResult: vi.fn(),
}));
vi.mock("@/lib/editorial/repository", () => ({
  getPublishedEditorialResult: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ getAppOrigin: vi.fn() }));
vi.mock("@/lib/jobs/repository", () => ({ getLiveJobFeed: vi.fn() }));
vi.mock("@/lib/salaries/repository", () => ({
  listPublishedSalaryAggregatesResult: vi.fn(),
}));
vi.mock("@/lib/seo/job-landing-repository", () => ({
  getAllJobLandingMetricsResults: vi.fn(),
}));
vi.mock("@/lib/seo/sitemap", () => ({ buildSitemapGroups: vi.fn() }));

import {
  getCompaniesResult,
  getPublishedCompanyEvidenceResult,
} from "@/lib/companies/repository";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";
import { getAppOrigin } from "@/lib/env";
import { getLiveJobFeed } from "@/lib/jobs/repository";
import { listPublishedSalaryAggregatesResult } from "@/lib/salaries/repository";

import { getAllJobLandingMetricsResults } from "./job-landing-repository";
import { loadSitemapData, loadSitemapGroups } from "./sitemap-data";
import { buildSitemapGroups } from "./sitemap";

const emptyGroups = {
  jobs: [],
  companies: [],
  salaries: [],
  tools: [],
  guides: [],
  insights: [],
};

const liveFeed = {
  jobs: [],
  state: "live" as const,
  checkedAt: "2026-07-14T00:00:00.000Z",
  sources: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppOrigin).mockReturnValue("https://salarypadi.test");
  vi.mocked(getPublishedEditorialResult).mockResolvedValue({
    state: "ready",
    data: [],
    issues: [],
  });
  vi.mocked(getLiveJobFeed).mockResolvedValue(liveFeed);
  vi.mocked(listPublishedSalaryAggregatesResult).mockResolvedValue({
    state: "ready",
    data: [],
    issues: [],
  });
  vi.mocked(getCompaniesResult).mockResolvedValue({
    state: "ready",
    data: [],
    issues: [],
  });
  vi.mocked(getPublishedCompanyEvidenceResult).mockResolvedValue({
    state: "ready",
    data: [],
    issues: [],
  });
  vi.mocked(buildSitemapGroups).mockReturnValue(emptyGroups);
});

describe("sitemap data orchestration", () => {
  it("includes only landing pages backed by current valid metrics", async () => {
    vi.mocked(getAllJobLandingMetricsResults).mockResolvedValue([
      {
        state: "ready",
        data: {
          key: "remote_nigeria",
          activeUniqueJobs: 24,
          uniqueJobsSeen90Days: 42,
          companyCount: 7,
          stableDemandSignal: true,
          lastModified: "2026-07-14T00:00:00.000Z",
          measuredAt: "2026-07-14T01:00:00.000Z",
        },
        issues: [],
      },
      {
        state: "unavailable",
        data: null,
        issues: [
          {
            operation: "seo.job_landing.city_lagos",
            kind: "query_failed",
            code: "job_landing_metrics_query_failed",
          },
        ],
      },
    ]);

    await expect(loadSitemapGroups()).resolves.toBe(emptyGroups);

    expect(buildSitemapGroups).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: "https://salarypadi.test",
        landingPages: [
          expect.objectContaining({
            path: "/jobs/remote",
            decision: expect.objectContaining({ indexable: true }),
            metrics: expect.objectContaining({ key: "remote_nigeria" }),
          }),
        ],
      }),
    );

    await expect(loadSitemapData()).resolves.toMatchObject({
      groups: emptyGroups,
      states: { jobs: "degraded", tools: "ready" },
    });
  });

  it("marks source-dependent inventories unavailable without fabricating emptiness", async () => {
    vi.mocked(getLiveJobFeed).mockResolvedValue({
      jobs: [],
      state: "unavailable",
      checkedAt: "2026-07-14T00:00:00.000Z",
      sources: [],
    });
    vi.mocked(getCompaniesResult).mockResolvedValue({
      state: "unavailable",
      data: [],
      issues: [],
    });
    vi.mocked(getPublishedCompanyEvidenceResult).mockResolvedValue({
      state: "unavailable",
      data: [],
      issues: [],
    });
    vi.mocked(listPublishedSalaryAggregatesResult).mockResolvedValue({
      state: "unavailable",
      data: [],
      issues: [],
    });
    vi.mocked(getPublishedEditorialResult).mockResolvedValue({
      state: "degraded",
      data: [],
      issues: [],
    });
    vi.mocked(getAllJobLandingMetricsResults).mockResolvedValue([]);

    await expect(loadSitemapData()).resolves.toMatchObject({
      states: {
        jobs: "unavailable",
        companies: "unavailable",
        salaries: "unavailable",
        tools: "ready",
        guides: "unavailable",
        insights: "unavailable",
      },
    });
  });

  it("passes the same live-feed read into company discovery", async () => {
    vi.mocked(getAllJobLandingMetricsResults).mockResolvedValue([]);

    await loadSitemapGroups();

    const feedPromise = vi.mocked(getLiveJobFeed).mock.results[0]?.value;
    expect(getCompaniesResult).toHaveBeenCalledWith(feedPromise);
    expect(buildSitemapGroups).toHaveBeenCalledWith(
      expect.objectContaining({ jobFeed: liveFeed, landingPages: [] }),
    );
  });
});
