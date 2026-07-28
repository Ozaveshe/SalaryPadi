import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CORNERSTONE_DRAFTS } from "@/lib/editorial/cornerstone-drafts";
import { JOB_LANDING_DEFINITIONS } from "@/lib/seo/job-landing-pages";
import { SITEMAP_KINDS } from "@/lib/seo/sitemap";

describe("machine-readable SEO audit", () => {
  const audit = JSON.parse(
    readFileSync(resolve("reports/seo-content-audit.json"), "utf8"),
  ) as {
    deploymentPerformed: boolean;
    productionObserved: {
      sitemap: { urlCount: number; productLeafCount: number };
    };
    localImplementation: {
      sitemapKinds: string[];
      landingRoutes: string[];
      cornerstoneDraftCount: number;
      cornerstonePublishedCount: number;
    };
  };

  it("preserves measured production truth separately from local implementation", () => {
    expect(audit.deploymentPerformed).toBe(false);
    expect(audit.productionObserved.sitemap).toEqual(
      expect.objectContaining({ urlCount: 9, productLeafCount: 0 }),
    );
  });

  it("matches the route and draft source registries", () => {
    expect(audit.localImplementation.sitemapKinds).toEqual(SITEMAP_KINDS);
    expect(audit.localImplementation.landingRoutes).toEqual(
      JOB_LANDING_DEFINITIONS.map((definition) => definition.path),
    );
    expect(audit.localImplementation.cornerstoneDraftCount).toBe(
      CORNERSTONE_DRAFTS.length,
    );
    expect(audit.localImplementation.cornerstonePublishedCount).toBe(0);
  });
});

describe("job landing page copy", () => {
  const BRAND_SUFFIX = " | SalaryPadi".length;

  it("fits every title in the search-result title budget", () => {
    for (const definition of JOB_LANDING_DEFINITIONS) {
      // The root layout appends "| SalaryPadi" via the metadata template, so
      // the rendered title is longer than the definition's own string.
      expect(
        definition.title.length + BRAND_SUFFIX,
        definition.path,
      ).toBeLessThanOrEqual(60);
    }
  });

  it("uses the available description budget without overflowing it", () => {
    for (const definition of JOB_LANDING_DEFINITIONS) {
      // Descriptions had been 81-109 characters, leaving a third of the
      // snippet unused on every landing page.
      expect(definition.description.length, definition.path).toBeGreaterThan(
        119,
      );
      expect(definition.description.length, definition.path).toBeLessThan(159);
    }
  });

  it("keeps internal page vocabulary out of the search snippet", () => {
    // Words that describe our own page machinery rather than the jobs a
    // searcher is looking for.
    const jargon =
      /high-signal|landing page|applicant-location evidence|source-authorized|projection|canonical record/i;
    for (const definition of JOB_LANDING_DEFINITIONS) {
      expect(jargon.test(definition.description), definition.path).toBe(false);
    }
  });

  it("leaves no landing page without an inbound internal link", () => {
    const inbound = new Map(
      JOB_LANDING_DEFINITIONS.map((definition) => [definition.path, 0]),
    );
    for (const definition of JOB_LANDING_DEFINITIONS) {
      for (const path of definition.relatedPaths) {
        if (inbound.has(path)) inbound.set(path, (inbound.get(path) ?? 0) + 1);
      }
    }
    for (const [path, count] of inbound) {
      // /jobs/ngo, /jobs/cities/lagos and /jobs/roles/software-engineering
      // were reachable only from the XML sitemap, so they earned no internal
      // link equity and no internal anchor text.
      expect(count, `${path} has no inbound internal link`).toBeGreaterThan(0);
    }
  });

  it("never links a landing page to itself", () => {
    for (const definition of JOB_LANDING_DEFINITIONS) {
      expect(definition.relatedPaths, definition.path).not.toContain(
        definition.path,
      );
    }
  });
});
