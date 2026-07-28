import { describe, expect, it } from "vitest";

import { readCvDraft, readCvSkills } from "./draft";
import {
  compareCvToJob,
  overlapRank,
  overlapStatement,
  readJobSkills,
} from "./relevance";

const SAMPLE_CV = [
  "Amaka Okafor",
  "Senior Backend Engineer",
  "Lagos, Nigeria | amaka@example.test",
  "",
  "Summary",
  "7 years of professional experience building payment systems.",
  "",
  "Skills",
  "TypeScript, Node.js, PostgreSQL, Docker, AWS",
].join("\n");

describe("reading a CV into profile proposals", () => {
  it("proposes only what the document states, with the line it read", () => {
    const draft = readCvDraft(SAMPLE_CV);

    expect(draft.yearsExperience?.value).toBe(7);
    expect(draft.yearsExperience?.evidence).toContain("7 years");
    expect(draft.experienceLevel?.value).toBe("senior");
    expect(draft.locationCountry?.value).toBe("NG");
    expect(draft.headline?.value).toBe("Senior Backend Engineer");
    expect(draft.skills).toContain("TypeScript");
    expect(draft.skills).toContain("PostgreSQL");
  });

  it("does not offer a name as a headline", () => {
    // Position alone cannot tell a name from a role, so a line without a role
    // word is never proposed — the alternative offers people their own name.
    const draft = readCvDraft(
      ["Amaka Okafor", "Lagos, Nigeria", "Built things at places."].join("\n"),
    );

    expect(draft.headline).toBeNull();
  });

  it("leaves a field absent rather than guessing it", () => {
    const draft = readCvDraft(
      "Chidi Eze\nWorks somewhere\nDid some things at a company.",
    );

    expect(draft.yearsExperience).toBeNull();
    expect(draft.experienceLevel).toBeNull();
    expect(draft.locationCountry).toBeNull();
    expect(draft.skills).toEqual([]);
  });

  it("never derives years of experience from a date on the page", () => {
    // A degree year is not a claim about years worked, and subtracting it would
    // put a number in front of an employer that the candidate never stated.
    const draft = readCvDraft(
      "Ngozi Bello\nBSc Computer Science, 2009\nWorked at two companies.",
    );

    expect(draft.yearsExperience).toBeNull();
  });

  it("reads only vocabulary terms the document literally contains", () => {
    const skills = readCvSkills(
      "I have used Node.js and nodejs and Kubernetes",
    );

    expect(skills).toContain("Node.js");
    expect(skills).toContain("Kubernetes");
    // "React" is never inferred from "Node.js" being present.
    expect(skills).not.toContain("React");
  });
});

describe("comparing a CV against a posting", () => {
  const job = {
    title: "Backend Engineer",
    description: "You will work with TypeScript, PostgreSQL and Kubernetes.",
  };

  it("reports the overlap as a share of what the posting names", () => {
    const overlap = compareCvToJob(["TypeScript", "PostgreSQL", "Figma"], job);

    expect(overlap.sharedSkills).toEqual(["TypeScript", "PostgreSQL"]);
    expect(overlap.missingSkills).toEqual(["Kubernetes"]);
    expect(overlap.coverage).toBeCloseTo(2 / 3);
    expect(overlapStatement(overlap)).toContain("TypeScript");
  });

  it("says there is nothing to compare rather than scoring a zero", () => {
    const overlap = compareCvToJob(["TypeScript"], {
      title: "Store Supervisor",
      description: "Oversee the daily running of a retail outlet.",
    });

    expect(overlap.coverage).toBeNull();
    expect(overlapStatement(overlap)).toContain("nothing to compare");
    // Sorts below any posting that could actually be compared.
    expect(overlapRank(overlap)).toBeLessThan(0);
  });

  it("distinguishes no overlap from nothing to compare", () => {
    const overlap = compareCvToJob(["Figma"], job);

    expect(overlap.sharedSkills).toEqual([]);
    expect(overlap.coverage).toBe(0);
    expect(overlapStatement(overlap)).toContain("does not mention");
  });

  it("reads a posting's own terms from its title as well as its body", () => {
    expect(
      readJobSkills({ title: "Python Developer", description: "" }),
    ).toContain("Python");
  });
});
