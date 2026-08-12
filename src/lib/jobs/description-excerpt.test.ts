import { describe, expect, it } from "vitest";

import {
  jobDescriptionExcerpt,
  publicJobDescription,
} from "./description-excerpt";
import type { Job } from "./types";

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

describe("publicJobDescription", () => {
  it("preserves a stored description", () => {
    expect(
      publicJobDescription({ description: "  Real role details.  " } as Job),
    ).toBe("Real role details.");
  });

  it("explains when a reviewed source cannot supply republishable copy", () => {
    const job = {
      description: "",
      title: "Product Designer",
      company: { name: "Example Ltd" },
      source: { name: "Reviewed Feed" },
    } as Job;

    expect(publicJobDescription(job)).toBe(
      "Reviewed Feed lists this Product Designer opportunity at Example Ltd. The reviewed source does not provide description text that SalaryPadi can republish, so open the original listing for responsibilities, requirements and application instructions.",
    );
  });
});
