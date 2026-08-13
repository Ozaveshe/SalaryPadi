import { describe, expect, it } from "vitest";

import growthReceipt from "../../../reports/editorial-growth-batch-2026-08-13.json";

import { SEO_GROWTH_ARTICLES } from "@/lib/editorial/seo-growth-articles";
import { SEO_STARTER_ARTICLES } from "@/lib/editorial/seo-starter-articles";

describe("SEO growth articles", () => {
  it("prepares exactly ten distinct, substantial and sourced guides", () => {
    expect(SEO_GROWTH_ARTICLES).toHaveLength(10);

    const existingSlugs = new Set<string>(
      SEO_STARTER_ARTICLES.map(({ slug }) => slug),
    );
    const growthSlugs = new Set(SEO_GROWTH_ARTICLES.map(({ slug }) => slug));
    expect(growthSlugs.size).toBe(10);
    expect([...growthSlugs].some((slug) => existingSlugs.has(slug))).toBe(
      false,
    );

    for (const article of SEO_GROWTH_ARTICLES) {
      const words = article.body_markdown.trim().split(/\s+/u);
      expect(words.length, article.slug).toBeGreaterThanOrEqual(600);
      expect(article.sources.length, article.slug).toBeGreaterThanOrEqual(3);
      expect(article.internal_link_targets.length, article.slug).toBe(4);
      expect(new Set(article.internal_link_targets).size, article.slug).toBe(4);
      expect(
        new Set(article.sources.map(({ url }) => url)).size,
        article.slug,
      ).toBe(article.sources.length);
      expect(
        article.sources.filter(({ url }) => url.startsWith("https://")).length,
        article.slug,
      ).toBeGreaterThanOrEqual(2);
      expect(
        Date.parse(article.review_due_at ?? ""),
        article.slug,
      ).toBeGreaterThan(Date.parse(article.updated_at));
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
      expect(
        article.sources.every(
          ({ url }) => url.startsWith("https://") || url.startsWith("/"),
        ),
        article.slug,
      ).toBe(true);
    }
  });

  it("keeps every internal link on a known SalaryPadi route", () => {
    const builtInGuidePaths = new Set([
      ...SEO_STARTER_ARTICLES.map(({ slug }) => `/guides/${slug}`),
      ...SEO_GROWTH_ARTICLES.map(({ slug }) => `/guides/${slug}`),
    ]);
    const productPaths = new Set([
      "/companies",
      "/jobs",
      "/jobs/graduate",
      "/jobs/nigeria",
      "/salaries",
      "/tools/job-scam-checker",
      "/tools/offer-compare",
      "/tools/take-home-pay",
    ]);

    for (const article of SEO_GROWTH_ARTICLES) {
      for (const target of article.internal_link_targets) {
        expect(
          productPaths.has(target) || builtInGuidePaths.has(target),
          `${article.slug} links to unknown route ${target}`,
        ).toBe(true);
      }
    }

    const allInternalTargets = [
      ...SEO_STARTER_ARTICLES,
      ...SEO_GROWTH_ARTICLES,
    ].flatMap(({ internal_link_targets }) => internal_link_targets);
    for (const article of SEO_GROWTH_ARTICLES) {
      expect(
        allInternalTargets.filter(
          (target) => target === `/guides/${article.slug}`,
        ).length,
        `${article.slug} must have a deliberate inbound guide link`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("keeps the local-only editorial receipt synchronized", () => {
    const wordCounts = SEO_GROWTH_ARTICLES.map(
      ({ body_markdown }) => body_markdown.trim().split(/\s+/u).length,
    );

    expect(growthReceipt.guideCount).toBe(SEO_GROWTH_ARTICLES.length);
    expect(growthReceipt.slugs).toEqual(
      SEO_GROWTH_ARTICLES.map(({ slug }) => slug),
    );
    expect(growthReceipt.minimumWordsPerGuide).toBe(Math.min(...wordCounts));
    expect(growthReceipt.maximumWordsPerGuide).toBe(Math.max(...wordCounts));
    expect(growthReceipt.deploymentPerformed).toBe(false);
    expect(growthReceipt.submissionPerformed).toBe(false);
    expect(growthReceipt.validation.focusedVitest).toMatchObject({
      result: "pass",
      testFilesPassed: 8,
      testsPassed: 39,
    });
    expect(growthReceipt.validation.browserE2E).toMatchObject({
      result: "pass",
      projects: ["mobile-360", "tablet-768", "desktop-chromium"],
      testsPassed: 9,
    });
  });
});
