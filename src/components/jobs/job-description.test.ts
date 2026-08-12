import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { JobDescription } from "./job-description";

describe("JobDescription", () => {
  it("renders a compact section index for structured listings", () => {
    const html = renderToStaticMarkup(
      createElement(JobDescription, {
        description:
          "About the Role\nBuild useful products.\nResponsibilities\n- Lead delivery\nRequirements\n- Five years experience",
        idPrefix: "role",
      }),
    );

    expect(html).toContain('aria-label="Sections in this listing"');
    expect(html).toContain('href="#role-about-the-role-1"');
    expect(html).toContain('<ul class="job-description-list">');
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("renders metadata-only copy as a source handoff, not fake role prose", () => {
    const html = renderToStaticMarkup(
      createElement(JobDescription, {
        description: "The full description is on the reviewed source.",
        sourceOnly: true,
        sourceName: "Access Bank careers",
        sourceUrl: "https://apply.workable.com/access-bank/j/ROLE",
      }),
    );

    expect(html).toContain("job-description-source-note");
    expect(html).toContain("Read the full description on Access Bank careers");
    expect(html).not.toContain("job-description-index");
  });
});
