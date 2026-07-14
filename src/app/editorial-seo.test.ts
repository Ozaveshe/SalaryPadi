import { describe, expect, it, vi } from "vitest";

import type { SitemapGroups } from "@/lib/seo/sitemap";

const { groups } = vi.hoisted((): { groups: SitemapGroups } => ({
  groups: {
    jobs: [],
    companies: [],
    salaries: [],
    tools: [{ url: "https://salarypadi.com/tools" }],
    guides: [
      { url: "https://salarypadi.com/guides/remote-jobs-open-to-nigerians" },
    ],
    insights: [
      {
        url: "https://salarypadi.com/insights/job-source-freshness-snapshot",
        lastModified: "2026-07-11T08:15:00.000Z",
      },
    ],
  },
}));

vi.mock("@/lib/env", () => ({ getAppOrigin: () => "https://salarypadi.com" }));
vi.mock("@/lib/seo/sitemap-data", () => ({
  loadSitemapGroups: vi.fn().mockResolvedValue(groups),
}));

import robots from "@/app/robots";
import { GET as getSitemapIndex } from "@/app/sitemap.xml/route";
import { GET as getInsightSitemap } from "@/app/sitemaps/insights.xml/route";

describe("editorial SEO surfaces", () => {
  it("allows crawlable editorial routes and advertises one sitemap index", () => {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    if (!rules) throw new Error("robots rules are missing");
    expect(rules.allow).toContain("/guides/");
    expect(rules.allow).toContain("/insights/");
    expect(result.sitemap).toBe("https://salarypadi.com/sitemap.xml");
    expect(rules.disallow).not.toContain("/jobs/");
    expect(rules.disallow).toContain("/account");
  });

  it("returns a six-part sitemap index and accurate child inventory", async () => {
    const index = await getSitemapIndex();
    expect(index.headers.get("content-type")).toContain("application/xml");
    const indexXml = await index.text();
    expect(indexXml).toContain("<sitemapindex");
    for (const kind of [
      "jobs",
      "companies",
      "salaries",
      "tools",
      "guides",
      "insights",
    ]) {
      expect(indexXml).toContain(`/sitemaps/${kind}.xml`);
    }

    const child = await getInsightSitemap();
    const childXml = await child.text();
    expect(childXml).toContain(
      "https://salarypadi.com/insights/job-source-freshness-snapshot",
    );
    expect(childXml).toContain("2026-07-11T08:15:00.000Z");
  });
});
