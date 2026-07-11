import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/editorial/repository", () => ({
  getPublishedEditorial: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ getAppOrigin: () => "https://salarypadi.com" }));

import { GET } from "@/app/feed.xml/route";
import { getPublishedEditorial } from "@/lib/editorial/repository";

describe("editorial RSS", () => {
  beforeEach(() => {
    vi.mocked(getPublishedEditorial).mockResolvedValue([
      {
        id: "57cb1fcb-e724-4ab7-8df2-a8c95f0dc03e",
        slug: "remote-jobs-open-to-nigerians",
        title: "Remote jobs & eligibility",
        description: "Evidence < volume.",
        article_kind: "cornerstone",
        body_markdown: "",
        author_name: "SalaryPadi Editorial",
        published_at: "2026-07-11T00:00:00.000Z",
        updated_at: "2026-07-11T00:00:00.000Z",
        internal_link_targets: [],
      },
    ]);
  });

  it("emits escaped RSS with a stable canonical item URL", async () => {
    const response = await GET();
    const xml = await response.text();
    expect(response.headers.get("content-type")).toContain(
      "application/rss+xml",
    );
    expect(xml).toContain('<rss version="2.0">');
    expect(xml).toContain("Remote jobs &amp; eligibility");
    expect(xml).toContain("Evidence &lt; volume.");
    expect(xml).toContain(
      "https://salarypadi.com/guides/remote-jobs-open-to-nigerians",
    );
  });
});
