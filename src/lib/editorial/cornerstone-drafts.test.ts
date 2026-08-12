import { describe, expect, it } from "vitest";

import { CORNERSTONE_DRAFTS } from "./cornerstone-drafts";

describe("unpublished cornerstone drafts", () => {
  it("keeps the two remaining substantial, approval-gated drafts outside public routes", () => {
    expect(CORNERSTONE_DRAFTS).toHaveLength(2);
    expect(new Set(CORNERSTONE_DRAFTS.map((draft) => draft.slug)).size).toBe(2);
    for (const draft of CORNERSTONE_DRAFTS) {
      expect(draft.status).toBe("draft");
      expect(draft.humanApprovalRequired).toBe(true);
      expect(draft.evidenceRequirements.length).toBeGreaterThanOrEqual(2);
      expect(draft.internalLinks.length).toBeGreaterThanOrEqual(3);
      expect(draft.bodyMarkdown.trim().split(/\s+/).length).toBeGreaterThan(
        150,
      );
      expect(draft.bodyMarkdown).toMatch(
        /HUMAN REVIEW REQUIRED|REVIEW REQUIRED/,
      );
    }
  });

  it("covers the requested editorial decisions without generated publication state", () => {
    const corpus = CORNERSTONE_DRAFTS.map(
      (draft) => `${draft.title} ${draft.description}`,
    ).join(" ");
    for (const phrase of ["company intelligence", "job freshness"]) {
      expect(corpus.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});
