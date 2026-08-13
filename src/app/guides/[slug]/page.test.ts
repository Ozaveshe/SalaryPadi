import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/editorial/repository", () => ({
  getPublishedArticleResult: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  getAppOrigin: vi.fn(() => "https://salarypadi.com"),
}));

import EditorialGuidePage from "./page";
import { getPublishedArticleResult } from "@/lib/editorial/repository";

const article = {
  id: "25df5583-f465-4762-89a9-9f48dcc4af43",
  slug: "scheduled-guide",
  title: "Scheduled guide",
  description: "A guide used to verify scheduled editorial status labels.",
  article_kind: "cornerstone" as const,
  body_markdown: "## Start here\n\nUse the dated evidence.",
  author_name: "SalaryPadi Editorial",
  published_at: "2026-08-01T00:00:00.000Z",
  updated_at: "2026-08-01T00:00:00.000Z",
  review_due_at: "2099-12-01T00:00:00.000Z",
  internal_link_targets: ["/jobs"],
  sources: [
    {
      name: "International Labour Organization",
      url: "https://www.ilo.org/",
      retrieved_at: "2026-08-01T00:00:00.000Z",
    },
  ],
};

async function renderArticle(overrides: Partial<typeof article>) {
  vi.mocked(getPublishedArticleResult).mockResolvedValue({
    state: "ready",
    data: { ...article, ...overrides },
    issues: [],
  });

  return renderToStaticMarkup(
    await EditorialGuidePage({
      params: Promise.resolve({ slug: article.slug }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scheduled editorial guide status", () => {
  it("distinguishes a future publication from a future editorial update", async () => {
    const publicationPreview = await renderArticle({
      published_at: "2099-08-01T00:00:00.000Z",
      updated_at: "2099-08-01T00:00:00.000Z",
    });

    expect(publicationPreview).toContain("<dt>Publishes</dt>");
    expect(publicationPreview).toContain("<dt>Review scheduled</dt>");
    expect(publicationPreview).toContain("Scheduled publication preview");
    expect(publicationPreview).toContain("before its publication date");

    const updatePreview = await renderArticle({
      updated_at: "2099-08-01T00:00:00.000Z",
    });

    expect(updatePreview).toContain("<dt>Published</dt>");
    expect(updatePreview).toContain("<dt>Review scheduled</dt>");
    expect(updatePreview).toContain("Scheduled update preview");
    expect(updatePreview).toContain(
      "includes an editorial update scheduled for the date shown above",
    );
  });

  it("emits attributable Article schema and safe external source links", async () => {
    const markup = await renderArticle({});

    expect(markup).toContain(
      '"image":"https://salarypadi.com/guides/scheduled-guide/opengraph-image"',
    );
    expect(markup).toContain('"inLanguage":"en-NG"');
    expect(markup).toContain('"isAccessibleForFree":true');
    expect(markup).toContain('"citation":["https://www.ilo.org/"]');
    expect(markup).toContain(
      'target="_blank" rel="noopener noreferrer nofollow"',
    );
  });
});
