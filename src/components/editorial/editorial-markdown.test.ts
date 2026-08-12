import { describe, expect, it } from "vitest";

import { parseEditorialMarkdown } from "./editorial-markdown";

describe("parseEditorialMarkdown", () => {
  it("renders stored headings as semantic sections instead of literal hashes", () => {
    expect(
      parseEditorialMarkdown("Intro.\n\n## Method\n\nChecked daily."),
    ).toEqual([
      { kind: "paragraph", text: "Intro." },
      { kind: "heading", level: 2, text: "Method", id: "method" },
      { kind: "paragraph", text: "Checked daily." },
    ]);
  });

  it("groups ordered and unordered list items", () => {
    expect(
      parseEditorialMarkdown("- Source\n- Date\n\n1. Read\n2. Check"),
    ).toMatchObject([
      { kind: "list", ordered: false, items: ["Source", "Date"] },
      { kind: "list", ordered: true, items: ["Read", "Check"] },
    ]);
  });
});
