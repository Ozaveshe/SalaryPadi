import { describe, expect, it } from "vitest";

import {
  jobDescriptionExcerpt,
  publicJobDescription,
  publicJobDescriptionView,
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

  it("preserves the line structure the renderer uses", () => {
    expect(
      publicJobDescription({
        description:
          "  About the role  \r\n\r\n  - Build useful products  \r\n  - Work with teams  ",
      } as Job),
    ).toBe("About the role\n\n- Build useful products\n- Work with teams");
  });

  it("explains when a reviewed source cannot supply republishable copy", () => {
    const job = {
      description: "",
      title: "Product Designer",
      company: { name: "Example Ltd" },
      source: { name: "Reviewed Feed" },
    } as Job;

    expect(publicJobDescription(job)).toBe(
      "Reviewed Feed lists this Product Designer opportunity at Example Ltd. Its full role description is available on the original listing and is not republished by SalaryPadi.",
    );
  });

  it("replaces the attributed-source placeholder with useful context", () => {
    const job = {
      description: "Open the attributed source listing for full details.",
      title: "Programme Officer",
      company: { name: "Example NGO" },
      source: { name: "ReliefWeb" },
    } as Job;

    expect(publicJobDescription(job)).toContain(
      "ReliefWeb lists this Programme Officer opportunity at Example NGO.",
    );
  });

  it("recognises the current metadata-only placeholder and source policy", () => {
    const job = {
      description:
        "This listing is available as source metadata only. SalaryPadi does not store the provider's full job description; use the application link to review the original posting.",
      title: "Relationship Manager",
      company: { name: "Access Bank" },
      source: { name: "Access Bank careers", canStoreFullDescription: false },
    } as Job;

    expect(publicJobDescriptionView(job).kind).toBe("source_only");
    expect(publicJobDescriptionView(job).text).not.toContain(
      "source metadata only",
    );
  });
});
