import { describe, expect, it } from "vitest";

import {
  assumed,
  collectAssumptions,
  combineOrigins,
  computeValue,
  disclosed,
  displaySuffix,
  entered,
  isEmployerFact,
  summariseComparison,
  unknown,
  type OfferSummary,
} from "./value-provenance";

describe("value provenance", () => {
  it("marks an employer-stated figure as the only kind of fact", () => {
    expect(isEmployerFact(disclosed(600_000))).toBe(true);
    for (const value of [
      entered(600_000),
      assumed(600_000, "Assumed mid-band"),
      unknown<number>(),
    ]) {
      expect(isEmployerFact(value)).toBe(false);
    }
  });

  it("never lets an assumption launder itself into a fact through arithmetic", () => {
    // The failure this module exists to prevent.
    const salary = disclosed(600_000);
    const taxBand = assumed(0.24, "PAYE band assumed from gross");
    const takeHome = computeValue([salary, taxBand], ([pay, rate]) =>
      Math.round(pay! * (1 - rate!)),
    );
    expect(takeHome.origin).toBe("estimated");
    expect(isEmployerFact(takeHome)).toBe(false);
  });

  it("produces a calculation when every input is stated or entered", () => {
    const result = computeValue(
      [disclosed(600_000), entered(50_000)],
      ([a, b]) => a! + b!,
    );
    expect(result.origin).toBe("calculated");
    expect(result.value).toBe(650_000);
  });

  it("takes the weakest input's strength, not the strongest", () => {
    expect(combineOrigins([disclosed(1), entered(1)])).toBe("calculated");
    expect(combineOrigins([disclosed(1), assumed(1, "x")])).toBe("estimated");
    expect(combineOrigins([disclosed(1), unknown()])).toBe("unknown");
  });

  it("treats a missing input as unknown rather than as zero", () => {
    // A missing bonus is not a bonus of nothing.
    const total = computeValue(
      [disclosed(600_000), unknown<number>()],
      ([a, b]) => a! + b!,
    );
    expect(total.value).toBeNull();
    expect(total.origin).toBe("unknown");
  });

  it("returns unknown rather than a nonsense number", () => {
    const result = computeValue([entered(1), entered(0)], ([a, b]) => a! / b!);
    expect(result.value).toBeNull();
  });

  it("marks estimates and assumptions on screen", () => {
    expect(displaySuffix(assumed(1, "x"))).toBe(" (est.)");
    expect(displaySuffix({ value: 1, origin: "estimated" })).toBe(" (est.)");
    // A stated figure is never decorated as an estimate.
    expect(displaySuffix(disclosed(1))).toBe("");
  });

  it("surfaces every assumption behind a result", () => {
    const assumptions = collectAssumptions([
      disclosed(600_000),
      assumed(0.24, "PAYE band assumed from gross"),
      assumed(12, "12 pay periods assumed"),
    ]);
    expect(assumptions).toHaveLength(2);
    expect(assumptions[0]?.detail).toContain("PAYE band");
  });

  it("preserves the employer's source timestamp on a disclosed value", () => {
    const value = disclosed(600_000, "2026-08-01T00:00:00Z");
    expect(value.sourceTimestamp).toBe("2026-08-01T00:00:00Z");
  });
});

function offer(
  label: string,
  monthly: number | null,
  tradeOffs: string[] = [],
): OfferSummary {
  const value =
    monthly === null
      ? unknown<number>()
      : { value: monthly, origin: "estimated" as const };
  const scenario = {
    scenario: "expected" as const,
    monthlyEffective: value,
    annualEffective:
      monthly === null
        ? unknown<number>()
        : { value: monthly * 12, origin: "estimated" as const },
  };
  return {
    label,
    scenarios: {
      conservative: { ...scenario, scenario: "conservative" },
      expected: scenario,
      optimistic: { ...scenario, scenario: "optimistic" },
    },
    tradeOffs,
  };
}

describe("decision summary", () => {
  it("never declares a winner", () => {
    const summary = summariseComparison([
      offer("Offer A", 800_000),
      offer("Offer B", 600_000),
    ]);
    // There is no winner field to read, by design.
    expect(Object.keys(summary).toSorted()).toEqual([
      "note",
      "statements",
      "unpriced",
    ]);
    expect(JSON.stringify(summary)).not.toMatch(/\bbest\b|\bwinner\b/i);
  });

  it("describes what each offer is stronger at", () => {
    const summary = summariseComparison([
      offer("Offer A", 800_000),
      offer("Offer B", 600_000),
    ]);
    expect(summary.statements[0]).toContain("higher estimated monthly");
    expect(summary.statements[1]).toContain("lower estimated monthly");
  });

  it("surfaces trade-offs the numbers could not price", () => {
    const summary = summariseComparison([
      offer("Offer A", 800_000, ["No health cover"]),
      offer("Offer B", 600_000, ["Paid in USD, lower currency risk"]),
    ]);
    expect(summary.unpriced).toHaveLength(2);
    expect(summary.unpriced.join(" ")).toContain("currency risk");
  });

  it("says so when an offer cannot be estimated at all", () => {
    const summary = summariseComparison([
      offer("Offer A", 800_000),
      offer("Offer B", null),
    ]);
    expect(summary.statements[1]).toContain("not enough information");
  });

  it("always reminds the reader the choice is theirs", () => {
    const summary = summariseComparison([offer("Offer A", 1)]);
    expect(summary.note).toContain("only you can weigh");
  });
});
