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
