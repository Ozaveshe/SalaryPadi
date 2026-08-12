import { describe, expect, it } from "vitest";

import { toDescriptionBlocks } from "./description-blocks";

describe("job description blocks", () => {
  it("rebuilds headings, paragraphs and lists from stored text", () => {
    const blocks = toDescriptionBlocks(
      [
        "About the Role",
        "This role leads the execution of the strategic agenda.",
        "Responsibilities",
        "- Lead delivery across the country programme",
        "- Report weekly to the Country Director",
        "Applications close once the role is filled.",
      ].join("\n"),
    );

    expect(blocks).toEqual([
      { kind: "heading", text: "About the Role" },
      {
        kind: "paragraph",
        text: "This role leads the execution of the strategic agenda.",
      },
      { kind: "heading", text: "Responsibilities" },
      {
        kind: "list",
        items: [
          "Lead delivery across the country programme",
          "Report weekly to the Country Director",
        ],
      },
      {
        kind: "paragraph",
        text: "Applications close once the role is filled.",
      },
    ]);
  });

  it("does not promote a sentence to a heading", () => {
    // A real paragraph rendered as a heading would misstate the posting's
    // emphasis, so punctuation and length both have to agree.
    const blocks = toDescriptionBlocks(
      "We are hiring.\nSomething follows this line.",
    );
    expect(blocks[0]).toEqual({ kind: "paragraph", text: "We are hiring." });
  });

  it("does not make a heading of the last line", () => {
    // Nothing follows it, so it is the closing line of the posting.
    const blocks = toDescriptionBlocks("Body copy here\nEqual Opportunity");
    expect(blocks.at(-1)).toEqual({
      kind: "paragraph",
      text: "Equal Opportunity",
    });
  });

  it("accepts a trailing colon on a heading and drops it", () => {
    expect(toDescriptionBlocks("Responsibilities:\nDo the work")[0]).toEqual({
      kind: "heading",
      text: "Responsibilities",
    });
  });

  it("groups consecutive bullets into one list", () => {
    const blocks = toDescriptionBlocks(
      "- one\n- two\nThis sentence separates the two lists.\n- three",
    );
    expect(blocks).toEqual([
      { kind: "list", items: ["one", "two"] },
      {
        kind: "paragraph",
        text: "This sentence separates the two lists.",
      },
      { kind: "list", items: ["three"] },
    ]);
  });

  it("restores known inline sections from a flattened provider description", () => {
    expect(
      toDescriptionBlocks(
        "We serve customers. Responsibilities: Lead delivery Requirements: Five years experience Benefits: Health cover",
      ),
    ).toEqual([
      { kind: "paragraph", text: "We serve customers." },
      { kind: "heading", text: "Responsibilities" },
      { kind: "paragraph", text: "Lead delivery" },
      { kind: "heading", text: "Requirements" },
      { kind: "paragraph", text: "Five years experience" },
      { kind: "heading", text: "Benefits" },
      { kind: "paragraph", text: "Health cover" },
    ]);
  });

  it("does not promote ordinary short phrases without structural evidence", () => {
    expect(
      toDescriptionBlocks("We build products\nMore detail follows")[0],
    ).toEqual({ kind: "paragraph", text: "We build products" });
  });

  it("recognises provider headings with a curly apostrophe", () => {
    expect(toDescriptionBlocks("What you’ll do\nBuild useful tools")).toEqual([
      { kind: "heading", text: "What you’ll do" },
      { kind: "paragraph", text: "Build useful tools" },
    ]);
  });

  it("repairs legacy inline boundaries and recognises observed provider sections", () => {
    expect(
      toDescriptionBlocks(
        "Job Objective\nJumiais a marketplace supported by [Jumia Logistics]and Jumia Pay.\nWhat you will be doing\n- Grow the category",
        { companyName: "Jumia" },
      ),
    ).toEqual([
      { kind: "heading", text: "Job Objective" },
      {
        kind: "paragraph",
        text: "Jumia is a marketplace supported by [Jumia Logistics] and Jumia Pay.",
      },
      { kind: "heading", text: "What you will be doing" },
      { kind: "list", items: ["Grow the category"] },
    ]);
  });

  it.each([
    "What we are looking for in you",
    "What we offer colleagues",
    "How you'll help us achieve it",
    "Nice-to-have skills",
    "Application Deadline",
    "Working at GiveDirectly",
  ])("recognises a frequent provider section label: %s", (label) => {
    expect(
      toDescriptionBlocks(`${label}\nThe source text follows.`)[0],
    ).toEqual({ kind: "heading", text: label });
  });

  it("treats a short unpunctuated line between lists as the label it is", () => {
    // "Benefits" sitting between two bullet lists is a section label, not a
    // one-word paragraph. This is the case the heading rule exists for.
    expect(toDescriptionBlocks("- one\nBenefits\n- health cover")[1]).toEqual({
      kind: "heading",
      text: "Benefits",
    });
  });

  it("accepts the bullet characters providers actually use", () => {
    for (const bullet of ["-", "•", "*", "·"]) {
      expect(toDescriptionBlocks(`${bullet} item`)).toEqual([
        { kind: "list", items: ["item"] },
      ]);
    }
  });

  it("drops blank lines rather than emitting empty blocks", () => {
    expect(toDescriptionBlocks("\n\nOnly line\n\n  \n")).toEqual([
      { kind: "paragraph", text: "Only line" },
    ]);
  });

  it("returns nothing for an empty description", () => {
    expect(toDescriptionBlocks("   ")).toEqual([]);
  });

  it("never emits markup, because the stored text has none", () => {
    // The strip guarantees this upstream; asserted here so a future change to
    // storage cannot quietly start rendering tags again.
    const blocks = toDescriptionBlocks("About\n<h3>not a tag anymore</h3>");
    const rendered = blocks
      .map((block) =>
        block.kind === "list" ? block.items.join(" ") : block.text,
      )
      .join(" ");
    expect(rendered).toContain("<h3>");
    // The renderer escapes it as text; this test documents that the module
    // itself does not interpret markup, it only groups lines.
    expect(blocks.some((block) => block.kind === "list")).toBe(false);
  });
});
