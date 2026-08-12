import { describe, expect, it } from "vitest";

import { jobDescriptionExcerpt } from "./description-excerpt";

describe("jobDescriptionExcerpt", () => {
  it("normalises imported whitespace", () => {
    expect(jobDescriptionExcerpt("Build products.\n\nWork with teams.")).toBe(
      "Build products. Work with teams.",
    );
  });

  it("cuts long descriptions on a word boundary", () => {
    const excerpt = jobDescriptionExcerpt(
      "SalaryPadi keeps every source visible and every unknown explicit.",
      42,
    );
    expect(excerpt).toBe("SalaryPadi keeps every source visible…");
    expect(excerpt.length).toBeLessThanOrEqual(42);
  });
});
