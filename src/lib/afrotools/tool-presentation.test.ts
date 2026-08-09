import { describe, expect, it } from "vitest";

import { BUNDLED_AFROTOOLS_CATALOG } from "./catalog-fallback";
import { groupCareerTools } from "./tool-presentation";

describe("career tool presentation", () => {
  it("keeps exactly three in-product experiences and twelve external links", () => {
    const grouped = groupCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);
    // job-offer-evaluator maps to the in-product /tools/offer-compare: the
    // product must never send users off-site for its own core comparison.
    expect(grouped.inside.map(({ id }) => id)).toEqual([
      "ng-paye",
      "currency-converter",
      "job-offer-evaluator",
    ]);
    expect(grouped.inside).toHaveLength(3);
    expect(grouped.external).toHaveLength(12);
    expect(
      grouped.inside.find(({ id }) => id === "job-offer-evaluator")?.href,
    ).toBe("/tools/offer-compare");
  });

  it("presents every reviewed tool as a user outcome", () => {
    const grouped = groupCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);
    for (const tool of [...grouped.inside, ...grouped.external]) {
      expect(tool.title).not.toMatch(/integration|cache|catalog|timestamp/i);
      expect(tool.description).not.toMatch(
        /integration|cache|catalog|timestamp/i,
      );
    }
  });
});
