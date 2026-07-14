import { describe, expect, it } from "vitest";

import { BUNDLED_AFROTOOLS_CATALOG } from "./catalog-fallback";
import { groupCareerTools } from "./tool-presentation";

describe("career tool presentation", () => {
  it("keeps exactly two in-product experiences and thirteen external links", () => {
    const grouped = groupCareerTools(BUNDLED_AFROTOOLS_CATALOG.tools);
    expect(grouped.inside.map(({ id }) => id)).toEqual([
      "ng-paye",
      "currency-converter",
    ]);
    expect(grouped.inside).toHaveLength(2);
    expect(grouped.external).toHaveLength(13);
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
