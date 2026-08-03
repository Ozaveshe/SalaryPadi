import { describe, expect, it } from "vitest";

import {
  GENERAL_MIN_CONTRIBUTORS,
  SENSITIVE_MIN_CONTRIBUTORS,
  assessSlice,
  decidePublication,
  type SliceDimension,
} from "./slice-privacy";

function slice(...dimensions: SliceDimension[]) {
  return { dimensions };
}

describe("slice shape", () => {
  it("publishes a role-and-country slice at the general threshold", () => {
    const verdict = assessSlice(slice("role", "country"));
    expect(verdict).toMatchObject({
      publishable: true,
      tier: "general",
      minContributors: GENERAL_MIN_CONTRIBUTORS,
    });
  });

  it("treats an employer slice as sensitive", () => {
    const verdict = assessSlice(slice("role", "country", "employer"));
    expect(verdict).toMatchObject({
      publishable: true,
      tier: "sensitive",
      minContributors: SENSITIVE_MIN_CONTRIBUTORS,
    });
  });

  it("never publishes an office or team slice, at any count", () => {
    // These name a group of colleagues who already know each other's roles.
    for (const dimension of ["office", "team"] as const) {
      const verdict = assessSlice(slice("role", "employer", dimension));
      expect(verdict.publishable).toBe(false);
    }
  });

  it("never publishes a single-month slice", () => {
    // Employer plus one month lets anyone who knows a joiner's start date
    // attribute the figure.
    expect(
      assessSlice(slice("role", "employer", "period_month")).publishable,
    ).toBe(false);
  });

  it("refuses a slice with no role dimension as uninterpretable", () => {
    expect(assessSlice(slice("country", "employer")).publishable).toBe(false);
  });

  it("refuses to stack more than two narrowing dimensions", () => {
    // Employer + city + seniority describes a handful of named people at the
    // size of company SalaryPadi actually covers.
    const verdict = assessSlice(slice("role", "employer", "city", "seniority"));
    expect(verdict.publishable).toBe(false);
    if (!verdict.publishable) {
      expect(verdict.reason).toMatch(/narrows the cohort to individuals/);
    }
  });

  it("decides on shape without ever seeing a count", () => {
    // The shape verdict must not be arguable by supplying more submissions.
    expect(assessSlice(slice("role", "employer", "team")).publishable).toBe(
      false,
    );
  });
});

describe("publication decision", () => {
  it("publishes a general slice that clears its threshold", () => {
    const decision = decidePublication({
      slice: slice("role", "country"),
      distinctContributors: 6,
      distinctEmployers: 4,
    });
    expect(decision).toMatchObject({ publish: true, tier: "general" });
  });

  it("holds a sensitive slice to the higher threshold", () => {
    const base = { slice: slice("role", "country", "employer") };
    expect(
      decidePublication({ ...base, distinctContributors: 6 }).publish,
    ).toBe(false);
    expect(
      decidePublication({ ...base, distinctContributors: 10 }).publish,
    ).toBe(true);
  });

  it("does not let a large cohort override an unpublishable shape", () => {
    const decision = decidePublication({
      slice: slice("role", "employer", "office"),
      distinctContributors: 500,
    });
    expect(decision.publish).toBe(false);
  });

  it("never reveals the cohort size in the public message", () => {
    // "Two more needed" tells the reader how many people are in the cell.
    const decision = decidePublication({
      slice: slice("role", "country"),
      distinctContributors: 3,
    });
    expect(decision.publish).toBe(false);
    if (!decision.publish) {
      expect(decision.publicMessage).not.toMatch(/\d/);
      expect(decision.publicMessage).toContain("Insufficient verified data");
      // The operator reason may carry the number; the public message may not.
      expect(decision.reason).toContain("3 distinct contributors");
    }
  });

  it("refuses a general slice that is really one employer in disguise", () => {
    const decision = decidePublication({
      slice: slice("role", "country"),
      distinctContributors: 20,
      distinctEmployers: 1,
    });
    expect(decision.publish).toBe(false);
  });

  it("explains an unpublishable shape without naming the dimension publicly", () => {
    const decision = decidePublication({
      slice: slice("role", "employer", "team"),
      distinctContributors: 50,
    });
    if (!decision.publish) {
      expect(decision.publicMessage).toContain(
        "protect the people who contributed",
      );
      expect(decision.publicMessage).not.toContain("team");
    }
  });
});
