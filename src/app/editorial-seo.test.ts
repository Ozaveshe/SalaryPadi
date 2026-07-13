import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getAppOrigin: () => "https://salarypadi.com" }));
vi.mock("@/lib/editorial/repository", () => ({
  getPublishedEditorialResult: vi.fn().mockResolvedValue({
    state: "ready",
    issues: [],
    data: [
      {
        id: "57cb1fcb-e724-4ab7-8df2-a8c95f0dc03e",
        slug: "remote-jobs-open-to-nigerians",
        title: "Remote jobs open to Nigerians",
        description: "Guide",
        article_kind: "cornerstone",
        body_markdown: "",
        author_name: "SalaryPadi Editorial",
        published_at: "2026-07-11T00:00:00.000Z",
        updated_at: "2026-07-11T00:00:00.000Z",
        internal_link_targets: ["/methodology"],
      },
      {
        id: "b21bb2e3-66c7-4044-87ba-c729d8147902",
        slug: "job-source-freshness-snapshot",
        title: "Source freshness",
        description: "Brief",
        article_kind: "data_brief",
        body_markdown: "Brief",
        author_name: "SalaryPadi Editorial",
        published_at: "2026-07-11T08:00:00.000Z",
        updated_at: "2026-07-11T08:15:00.000Z",
        internal_link_targets: ["/methodology"],
      },
    ],
  }),
}));
vi.mock("@/lib/jobs/repository", () => ({
  getLiveJobFeed: vi.fn().mockResolvedValue({
    jobs: [],
    state: "disabled",
    checkedAt: "2026-07-11T00:00:00.000Z",
    sources: [],
  }),
}));
vi.mock("@/lib/salaries/repository", () => ({
  listPublishedSalaryAggregatesResult: vi.fn().mockResolvedValue({
    state: "ready",
    data: [],
    issues: [],
  }),
}));
vi.mock("@/lib/companies/repository", () => ({
  getCompaniesResult: vi.fn().mockResolvedValue({
    state: "ready",
    data: [],
    issues: [],
  }),
  getPublishedCompanyEvidenceResult: vi.fn().mockResolvedValue({
    state: "ready",
    data: [],
    issues: [],
  }),
}));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

describe("editorial SEO surfaces", () => {
  it("allows editorial routes and advertises both sitemaps", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    if (!rules) throw new Error("robots rules are missing");
    expect(rules.allow).toContain("/guides/");
    expect(rules.allow).toContain("/insights/");
    expect(result.sitemap).toEqual([
      "https://salarypadi.com/sitemap.xml",
      "https://salarypadi.com/tools/sitemap.xml",
    ]);
    expect(rules.disallow).not.toContain("/jobs/");
    expect(rules.disallow).not.toContain("/companies/");
    expect(rules.disallow).not.toContain("/salaries/");
    expect(rules.disallow).toContain("/account");
  });

  it("includes only published brief routes with their real modification time", async () => {
    const result = await sitemap();
    expect(result).toContainEqual(
      expect.objectContaining({
        url: "https://salarypadi.com/insights/job-source-freshness-snapshot",
        lastModified: "2026-07-11T08:15:00.000Z",
      }),
    );
    expect(result).toContainEqual(
      expect.objectContaining({
        url: "https://salarypadi.com/guides/remote-jobs-open-to-nigerians",
      }),
    );
  });
});
