import { describe, expect, it } from "vitest";

import type { EditorialArticle } from "@/lib/editorial/repository";

import { buildEditorialBriefMetadata } from "./editorial-metadata";

const brief: EditorialArticle = {
  id: "57cb1fcb-e724-4ab7-8df2-a8c95f0dc03e",
  slug: "nigeria-job-supply",
  title: "Nigeria job supply",
  description: "A bounded data brief.",
  article_kind: "data_brief",
  body_markdown: "Evidence.",
  author_name: "SalaryPadi Editorial",
  published_at: "2026-07-14T00:00:00.000Z",
  updated_at: "2026-07-14T01:00:00.000Z",
  internal_link_targets: ["/jobs"],
};

describe("editorial brief metadata", () => {
  it("keeps an inconclusive editorial read out of search indexes", () => {
    expect(
      buildEditorialBriefMetadata({
        state: "degraded",
        data: null,
        issues: [
          {
            operation: "editorial.list",
            kind: "upstream_unavailable",
            code: "editorial_request_failed",
          },
        ],
      }),
    ).toMatchObject({
      title: "Editorial brief unavailable",
      robots: { index: false, follow: true },
    });
  });

  it("lets a confirmed missing brief flow into the route's not-found policy", () => {
    expect(
      buildEditorialBriefMetadata({
        state: "ready",
        data: null,
        issues: [],
      }),
    ).toEqual({});
  });

  it("builds canonical article metadata only for a verified data brief", () => {
    expect(
      buildEditorialBriefMetadata({
        state: "ready",
        data: brief,
        issues: [],
      }),
    ).toMatchObject({
      title: brief.title,
      alternates: { canonical: "/insights/nigeria-job-supply" },
      openGraph: {
        type: "article",
        publishedTime: brief.published_at,
        modifiedTime: brief.updated_at,
      },
    });
  });

  it("does not publish a cornerstone through a data-brief route", () => {
    expect(
      buildEditorialBriefMetadata({
        state: "ready",
        data: { ...brief, article_kind: "cornerstone" },
        issues: [],
      }),
    ).toEqual({});
  });
});
