import { describe, expect, it } from "vitest";

import { SEO_GROWTH_ARTICLES } from "@/lib/editorial/seo-growth-articles";
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

  it("links priority starter guides into the new application cluster", () => {
    const bySlug = new Map(
      SEO_STARTER_ARTICLES.map((article) => [article.slug, article]),
    );
    const growthPaths = new Set(
      SEO_GROWTH_ARTICLES.map(({ slug }) => `/guides/${slug}`),
    );

    expect(
      bySlug.get("compare-two-job-offers")?.internal_link_targets,
    ).toContain("/guides/what-to-check-before-accepting-job-offer-nigeria");
    expect(
      bySlug.get("graduate-trainee-internship-and-nysc-jobs")
        ?.internal_link_targets,
    ).toContain("/guides/how-to-change-careers-in-nigeria");
    expect(
      SEO_STARTER_ARTICLES.flatMap(
        ({ internal_link_targets }) => internal_link_targets,
      ).filter((target) => growthPaths.has(target)),
    ).toHaveLength(2);
  });
});
