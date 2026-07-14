import { describe, expect, it } from "vitest";

import { roundSalaryEstimate } from "./presentation";

describe("salary aggregate presentation", () => {
  it("rounds estimates to avoid implying unsupported precision", () => {
    expect(roundSalaryEstimate(523_456)).toBe(520_000);
    expect(roundSalaryEstimate(78_950)).toBe(79_000);
    expect(roundSalaryEstimate(999)).toBe(1_000);
  });

  it("rejects non-finite estimates", () => {
    expect(() => roundSalaryEstimate(Number.NaN)).toThrow(
      "invalid_salary_estimate",
    );
  });
});
