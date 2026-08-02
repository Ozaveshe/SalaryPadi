import { describe, expect, it } from "vitest";

import {
  DEFAULT_PER_EMPLOYER_CAP,
  diversifyResults,
  measureConcentration,
} from "./result-diversity";

interface Row {
  employerKey: string | null;
  id: string;
}

function rows(spec: readonly [string | null, number][]): Row[] {
  const out: Row[] = [];
  for (const [employerKey, count] of spec) {
    for (let i = 0; i < count; i += 1) {
      out.push({ employerKey, id: `${employerKey ?? "none"}-${i}` });
    }
  }
  return out;
}

describe("result diversity", () => {
  it("breaks up a first page dominated by one employer", () => {
    // The measured production shape: three employers hold 84% of inventory.
    const input = rows([
      ["renmoney", 70],
      ["canonical", 68],
      ["moniepoint", 56],
      ["kuda", 13],
      ["fairmoney", 8],
      ["zipline", 6],
    ]);
    const { results } = diversifyResults(input);
    const firstPage = results.slice(0, 10);
    const distinct = new Set(firstPage.map((row) => row.employerKey));
    // Without the cap the first ten would be one employer.
    expect(distinct.size).toBeGreaterThanOrEqual(4);
    for (const employer of distinct) {
      const appearances = firstPage.filter(
        (row) => row.employerKey === employer,
      ).length;
      expect(appearances).toBeLessThanOrEqual(DEFAULT_PER_EMPLOYER_CAP);
    }
  });

  it("hides nothing — every input result is still returned", () => {
    const input = rows([
      ["a", 30],
      ["b", 5],
    ]);
    const { results } = diversifyResults(input);
    expect(results).toHaveLength(input.length);
    expect(new Set(results.map((row) => row.id)).size).toBe(input.length);
  });

  it("preserves the caller's order within an employer", () => {
    const input = rows([
      ["a", 5],
      ["b", 5],
    ]);
    const { results } = diversifyResults(input);
    const aOrder = results
      .filter((row) => row.employerKey === "a")
      .map((row) => row.id);
    expect(aOrder).toEqual(["a-0", "a-1", "a-2", "a-3", "a-4"]);
  });

  it("reports which employers were deferred so the UI can offer more", () => {
    const { deferred } = diversifyResults(
      rows([
        ["a", 10],
        ["b", 2],
      ]),
    );
    expect(deferred).toEqual([{ employerKey: "a", deferredCount: 7 }]);
  });

  it("leaves an already-diverse result set untouched", () => {
    const input = rows([
      ["a", 2],
      ["b", 2],
      ["c", 2],
    ]);
    const outcome = diversifyResults(input);
    expect(outcome.applied).toBe(false);
    expect(outcome.results.map((row) => row.id)).toEqual(
      input.map((row) => row.id),
    );
  });

  it("never caps results that carry no employer identity", () => {
    const input = rows([[null, 8]]);
    const { results, applied } = diversifyResults(input);
    expect(applied).toBe(false);
    expect(results).toHaveLength(8);
  });

  it("applies the cap only inside the window", () => {
    const input = rows([["a", 40]]);
    const { results } = diversifyResults(input, {
      windowSize: 5,
      perEmployerCap: 2,
    });
    // Everything beyond the window keeps its original position.
    expect(results).toHaveLength(40);
  });

  it("handles empty and single-result sets without reordering", () => {
    expect(diversifyResults([]).results).toEqual([]);
    const one = rows([["a", 1]]);
    expect(diversifyResults(one).results).toEqual(one);
  });
});

describe("concentration monitoring", () => {
  it("raises an alert at the measured production concentration", () => {
    const report = measureConcentration(
      rows([
        ["renmoney", 70],
        ["canonical", 68],
        ["moniepoint", 56],
        ["kuda", 13],
        ["fairmoney", 8],
        ["zipline", 6],
        ["oneacrefund", 4],
        ["mkopa", 2],
        ["evidenceaction", 2],
        ["lemfi", 1],
      ]),
    );
    expect(report.total).toBe(230);
    expect(report.distinctEmployers).toBe(10);
    expect(report.topThreeShare).toBeGreaterThan(0.8);
    expect(report.alert).toBe(true);
    expect(report.reason).toMatch(/Concentration high/);
  });

  it("stays quiet when inventory is spread across many employers", () => {
    const spec: [string, number][] = [];
    for (let i = 0; i < 40; i += 1) spec.push([`employer-${i}`, 5]);
    const report = measureConcentration(rows(spec));
    expect(report.alert).toBe(false);
    expect(report.topShare).toBeLessThan(0.1);
  });

  it("reports nothing to measure rather than dividing by zero", () => {
    const report = measureConcentration([]);
    expect(report.total).toBe(0);
    expect(report.alert).toBe(false);
  });

  it("ranks employers by share, largest first", () => {
    const report = measureConcentration(
      rows([
        ["small", 1],
        ["big", 9],
      ]),
    );
    expect(report.readings[0]?.employerKey).toBe("big");
    expect(report.readings[0]?.share).toBeCloseTo(0.9);
  });
});
