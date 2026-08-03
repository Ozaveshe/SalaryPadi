import { describe, expect, it } from "vitest";

import {
  GENERAL_MIN_CONTRIBUTORS,
  SENSITIVE_MIN_CONTRIBUTORS,
  assessSlice,
  decidePublication,
  salaryCellSlice,
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

  it("refuses the disguise in a sensitive slice too", () => {
    /*
     * Regression: this check used to be gated on the general tier, so any
     * slice carrying a narrowing dimension escaped it — a role + country +
     * employment_type cell drawn entirely from one company published as a
     * national figure. The disguise is worse there, not better.
     */
    const decision = decidePublication({
      slice: slice("role", "country", "employment_type"),
      distinctContributors: 40,
      distinctEmployers: 1,
    });
    expect(decision.publish).toBe(false);
    if (!decision.publish) {
      expect(decision.reason).toMatch(/employer slice in disguise/);
    }
  });

  it("does not apply the disguise check to a slice that names its employer", () => {
    // One employer is the whole point of an employer slice; it is already
    // held to the employer threshold.
    expect(
      decidePublication({
        slice: slice("role", "country", "employer"),
        distinctContributors: 10,
        distinctEmployers: 1,
      }).publish,
    ).toBe(true);
  });
});

describe("the salary worker's cells", () => {
  it("treats the national cell as general", () => {
    const verdict = assessSlice(
      salaryCellSlice({ namesEmployer: false, namesOffice: false }),
    );
    expect(verdict).toMatchObject({
      publishable: true,
      tier: "general",
      minContributors: GENERAL_MIN_CONTRIBUTORS,
    });
  });

  it("does not let units of measure narrow a cell", () => {
    /*
     * The worker also groups by currency, gross/net and engagement type so a
     * published median means something. Counting those as narrowing would
     * push every cell to the sensitive tier for stating its units.
     */
    expect(
      salaryCellSlice({ namesEmployer: false, namesOffice: false }).dimensions,
    ).toEqual(["role", "country"]);
  });

  it("makes a company cell sensitive", () => {
    expect(
      assessSlice(salaryCellSlice({ namesEmployer: true, namesOffice: false })),
    ).toMatchObject({
      tier: "sensitive",
      minContributors: SENSITIVE_MIN_CONTRIBUTORS,
    });
  });

  it("refuses a national cell supplied by one employer", () => {
    // The disguised-employer case, in the exact shape the worker emits.
    expect(
      decidePublication({
        slice: salaryCellSlice({ namesEmployer: false, namesOffice: false }),
        distinctContributors: 40,
        distinctEmployers: 1,
      }).publish,
    ).toBe(false);
  });

  it("never releases an office-scoped cell, whoever asks", () => {
    // app.salary_aggregate_snapshots carries an office_id column, so this is
    // a real slot in the schema rather than a hypothetical one.
    for (const namesEmployer of [true, false]) {
      expect(
        decidePublication({
          slice: salaryCellSlice({ namesEmployer, namesOffice: true }),
          distinctContributors: 1_000,
          distinctEmployers: 50,
        }).publish,
      ).toBe(false);
    }
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
