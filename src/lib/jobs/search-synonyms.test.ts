import { describe, expect, it } from "vitest";

import { expandJobSearchQuery } from "./search-synonyms";

describe("job search synonym expansion", () => {
  it("expands a role word into its equivalent phrases", () => {
    const expansions = expandJobSearchQuery("devops");
    expect(expansions).toContain("platform engineer");
    expect(expansions).toContain("site reliability");
    expect(expansions).not.toContain("devops");
  });

  it("activates on the role word inside a longer query", () => {
    const expansions = expandJobSearchQuery("frontend developer");
    expect(expansions).toContain("front end");
    expect(expansions).toContain("ui engineer");
  });

  it("normalizes hyphenated and slashed spellings", () => {
    expect(expandJobSearchQuery("front-end")).toContain("frontend");
    expect(expandJobSearchQuery("QA/test")).toContain("quality assurance");
  });

  it("does not expand a generic word into unrelated groups", () => {
    // "developer" alone matches no complete phrase in any group.
    expect(expandJobSearchQuery("developer")).toEqual([]);
    expect(expandJobSearchQuery("engineer")).toEqual([]);
  });

  it("returns nothing for unknown or tiny queries", () => {
    expect(expandJobSearchQuery("welder")).toEqual([]);
    expect(expandJobSearchQuery("a")).toEqual([]);
    expect(expandJobSearchQuery("")).toEqual([]);
  });

  it("stays within the expansion bound", () => {
    for (const query of ["devops", "customer support", "mobile developer"]) {
      expect(expandJobSearchQuery(query).length).toBeLessThanOrEqual(12);
    }
  });

  it("maps everyday Nigerian role phrasings both directions", () => {
    expect(expandJobSearchQuery("customer care")).toContain("customer service");
    expect(expandJobSearchQuery("call center")).toContain("customer support");
    expect(expandJobSearchQuery("account officer")).toContain("accountant");
  });
});
