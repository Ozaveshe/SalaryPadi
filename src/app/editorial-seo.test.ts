import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ getAppOrigin: () => "https://salarypadi.com" }));
vi.mock("@/lib/editorial/repository", () => ({
  getPublishedEditorial: vi.fn().mockResolvedValue([
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
  ]),
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
