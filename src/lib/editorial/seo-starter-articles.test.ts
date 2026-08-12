import { describe, expect, it } from "vitest";

import { SEO_STARTER_ARTICLES } from "@/lib/editorial/seo-starter-articles";

describe("SEO starter articles", () => {
  it("publishes exactly ten substantial, sourced guides", () => {
    expect(SEO_STARTER_ARTICLES).toHaveLength(10);
    expect(new Set(SEO_STARTER_ARTICLES.map(({ slug }) => slug)).size).toBe(10);

    for (const article of SEO_STARTER_ARTICLES) {
      const words = article.body_markdown.trim().split(/\s+/u);
      expect(words.length, article.slug).toBeGreaterThanOrEqual(400);
      expect(article.sources.length, article.slug).toBeGreaterThanOrEqual(2);
      expect(article.review_due_at, article.slug).toMatch(
        /^\d{4}-\d{2}-\d{2}/u,
      );
      expect(
        article.title.length + " | SalaryPadi".length,
        article.slug,
      ).toBeLessThanOrEqual(65);
      expect(article.description.length, article.slug).toBeGreaterThanOrEqual(
        105,
      );
      expect(article.description.length, article.slug).toBeLessThanOrEqual(160);
    }
  });
});
