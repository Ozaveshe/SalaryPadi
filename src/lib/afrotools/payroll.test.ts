import { describe, expect, it } from "vitest";

import { mergeAfroToolsTaxResult } from "@/lib/afrotools/payroll";
import { calculateNigeriaPayroll } from "@/lib/payroll";

describe("AfroTools PAYE mapping", () => {
  it("uses upstream statutory values and recomputes cash take-home", () => {
    const local = calculateNigeriaPayroll({
      calculationDate: "2026-07-10",
      grossCashPay: { amount: 500_000, period: "monthly" },
      pension: { mode: "not_applicable" },
      nhf: { sector: "private", participationOverride: false },
      healthInsuranceContribution: { amount: 0, period: "monthly" },
      otherDeductions: [
        {
          label: "Union dues",
          amount: { amount: 2_000, period: "monthly" },
        },
      ],
    });
    const result = mergeAfroToolsTaxResult(local, {
      deductions: { pension: 0, nhf: 0, nhis: 0, rentRelief: 0 },
      tax: { taxableIncome: 6_000_000, netTax: 780_000 },
    });

    expect(result.annual.paye).toBe(780_000);
    expect(result.annual.totalCashDeductions).toBe(804_000);
    expect(result.annual.takeHomePay).toBe(5_196_000);
    expect(result.monthly.takeHomePay).toBe(433_000);
  });
});
