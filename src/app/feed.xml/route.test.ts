import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editorial/repository", () => ({
  getPublishedEditorialResult: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ getAppOrigin: () => "https://salarypadi.com" }));

import { GET } from "@/app/feed.xml/route";
import { getPublishedEditorialResult } from "@/lib/editorial/repository";

const guide = {
  id: "57cb1fcb-e724-4ab7-8df2-a8c95f0dc03e",
  slug: "remote-jobs-open-to-nigerians",
  title: "Remote jobs & eligibility",
  description: "Evidence < volume.",
  article_kind: "cornerstone" as const,
  body_markdown: "",
  author_name: "SalaryPadi Editorial",
  published_at: "2026-07-11T00:00:00.000Z",
  updated_at: "2026-07-11T00:00:00.000Z",
  internal_link_targets: [],
};

describe("editorial RSS", () => {
  beforeEach(() => {
    vi.mocked(getPublishedEditorialResult).mockResolvedValue({
      state: "ready",
      data: [guide],
      issues: [],
    });
  });

  it("emits escaped RSS with a stable canonical item URL", async () => {
    const response = await GET();
    const xml = await response.text();
    expect(response.headers.get("content-type")).toContain(
      "application/rss+xml",
    );
    expect(response.headers.get("x-salarypadi-editorial-state")).toBe("ready");
    expect(response.headers.get("cache-control")).toContain("s-maxage=900");
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("Remote jobs &amp; eligibility");
    expect(xml).toContain("Evidence &lt; volume.");
    expect(xml).toContain(
      "https://salarypadi.com/guides/remote-jobs-open-to-nigerians",
    );
  });

  it("marks and briefly caches a fallback feed when editorial evidence is degraded", async () => {
    vi.mocked(getPublishedEditorialResult).mockResolvedValue({
      state: "degraded",
      data: [guide],
      issues: [
        {
          operation: "editorial.list",
          kind: "upstream_unavailable",
          code: "editorial_request_failed",
        },
      ],
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("x-salarypadi-editorial-state")).toBe(
      "degraded",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=60");
    await expect(response.text()).resolves.toContain(
      "remote-jobs-open-to-nigerians",
    );
  });
});
