import { describe, expect, it } from "vitest";

import {
  NIGERIA_PAYROLL_RULES_2026,
  assertNigeriaPayrollRuleSets,
  calculateNigeriaPayroll,
  calculateProgressiveTax,
  normalizeToAnnual,
  resolveNigeriaPayrollRules,
} from "./index";
import type { NigeriaPayrollInput, PeriodicAmount } from "./types";

const annual = (amount: number): PeriodicAmount => ({
  amount,
  period: "annual",
});
const monthly = (amount: number): PeriodicAmount => ({
  amount,
  period: "monthly",
});

function inputFor(
  grossCashPay: PeriodicAmount,
  overrides: Partial<NigeriaPayrollInput> = {},
): NigeriaPayrollInput {
  return {
    calculationDate: "2026-07-10",
    grossCashPay,
    pension: { mode: "not_applicable" },
    nhf: { sector: "private" },
    healthInsuranceContribution: annual(0),
    ...overrides,
  };
}

function noticeCodes(notices: readonly { code: string }[]) {
  return notices.map((notice) => notice.code);
}

describe("versioned Nigeria payroll rules", () => {
  it("selects the NTA 2025 rule set from its 2026 effective date", () => {
    const rule = resolveNigeriaPayrollRules("2026-01-01");

    expect(rule.id).toBe("ng-payroll-nta-2025-v1");
    expect(rule.version).toBe("2026.1.0");
    expect(rule.effectiveFrom).toBe("2026-01-01");
    expect(rule.minimumWage).toEqual({ monthly: 70_000, annual: 840_000 });
    expect(rule.healthInsurance.nationalDefaultEmployeeRateBps).toBeNull();
  });

  it("retains authoritative source metadata for every rule area", () => {
    const sourceIds = NIGERIA_PAYROLL_RULES_2026.sources.map(
      (source) => source.id,
    );

    expect(sourceIds).toEqual(
      expect.arrayContaining([
        "nigeria-tax-act-2025",
        "nigeria-tax-administration-act-2025",
        "national-minimum-wage-2024",
        "pension-reform-act-2014",
        "business-facilitation-act-2022",
        "nhia-act-2022",
      ]),
    );
    expect(
      NIGERIA_PAYROLL_RULES_2026.sources.every((source) =>
        source.url.startsWith("https://"),
      ),
    ).toBe(true);
  });

  it.each(["2025-12-31", "not-a-date", "2026-02-30"])(
    "rejects a date with no valid matching rule: %s",
    (calculationDate) => {
      expect(() => resolveNigeriaPayrollRules(calculationDate)).toThrow();
    },
  );

  it("warns when the requested date is later than the source review date", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(1_000_000), { calculationDate: "2026-07-11" }),
    );

    expect(noticeCodes(result.warnings)).toContain("RULE_REVIEW_DATE_EXCEEDED");
  });

  it("fails fast on overlapping rule windows", () => {
    expect(() =>
      assertNigeriaPayrollRuleSets([
        NIGERIA_PAYROLL_RULES_2026,
        {
          ...NIGERIA_PAYROLL_RULES_2026,
          id: "ng-payroll-next",
          version: "2026.2.0",
          effectiveFrom: "2026-06-01",
        },
      ]),
    ).toThrow(/overlapping effective windows/);
  });

  it("fails fast on unordered bands and unsafe source evidence", () => {
    expect(() =>
      assertNigeriaPayrollRuleSets([
        {
          ...NIGERIA_PAYROLL_RULES_2026,
          payeBands: [
            { upperBoundAnnual: 3_000_000, rateBps: 1_500 },
            { upperBoundAnnual: 800_000, rateBps: 0 },
            { upperBoundAnnual: null, rateBps: 2_500 },
          ],
        },
      ]),
    ).toThrow(/strictly ordered/);

    expect(() =>
      assertNigeriaPayrollRuleSets([
        {
          ...NIGERIA_PAYROLL_RULES_2026,
          sources: [
            {
              ...NIGERIA_PAYROLL_RULES_2026.sources[0]!,
              url: "https://user:secret@example.com/source",
            },
          ],
        },
      ]),
    ).toThrow(/invalid source evidence/);
  });
});

describe("money normalization and progressive PAYE", () => {
  it("normalizes monthly and annual money to annual nearest-naira values", () => {
    expect(normalizeToAnnual(monthly(100_000))).toBe(1_200_000);
    expect(normalizeToAnnual(annual(1_200_000))).toBe(1_200_000);
    expect(normalizeToAnnual(monthly(1_000.5))).toBe(12_012);
    expect(normalizeToAnnual(annual(1_000.5))).toBe(1_001);
  });

  it.each([
    [0, 0],
    [800_000, 0],
    [800_004, 1],
    [3_000_000, 330_000],
    [12_000_000, 1_950_000],
    [25_000_000, 4_680_000],
    [50_000_000, 10_430_000],
    [50_000_004, 10_430_001],
  ])(
    "taxes annual chargeable income %i at the 2026 bands",
    (income, expected) => {
      expect(
        calculateProgressiveTax(income, NIGERIA_PAYROLL_RULES_2026.payeBands),
      ).toBe(expected);
    },
  );

  it.each([
    [3_000_000, 330_000],
    [12_000_000, 1_950_000],
    [25_000_000, 4_680_000],
    [50_000_000, 10_430_000],
  ])("preserves the PAYE band boundary at N%i", (gross, expectedPaye) => {
    const result = calculateNigeriaPayroll(inputFor(annual(gross)));

    expect(result.annual.chargeableIncome).toBe(gross);
    expect(result.annual.paye).toBe(expectedPaye);
  });

  it("does not apply the repealed consolidated relief allowance", () => {
    const result = calculateNigeriaPayroll(inputFor(annual(1_000_000)));

    expect(result.annual.chargeableIncome).toBe(1_000_000);
    expect(result.annual.paye).toBe(30_000);
    expect(result.annual.takeHomePay).toBe(970_000);
  });

  it("calculates a complete monthly example from explicit inputs", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(500_000), {
        pension: {
          mode: "statutory",
          pensionableEmoluments: monthly(300_000),
        },
        eligibleTaxDeductions: { rentPaid: monthly(100_000) },
      }),
    );

    expect(result.annual).toMatchObject({
      grossCashPay: 6_000_000,
      employeePension: 288_000,
      rentRelief: 240_000,
      chargeableIncome: 5_472_000,
      paye: 774_960,
      takeHomePay: 4_937_040,
    });
    expect(result.monthly.takeHomePay).toBe(411_420);
  });
});

describe("minimum-wage exemption and employment income", () => {
  it("exempts gross employment income exactly at the annual minimum wage", () => {
    const result = calculateNigeriaPayroll(inputFor(annual(840_000)));

    expect(result.decisions.minimumWageExemptionApplied).toBe(true);
    expect(result.annual.paye).toBe(0);
  });

  it("applies the bands immediately above the minimum-wage exemption", () => {
    const result = calculateNigeriaPayroll(inputFor(annual(840_001)));

    expect(result.decisions.minimumWageExemptionApplied).toBe(false);
    expect(result.annual.paye).toBe(6_000);
  });

  it("includes taxable non-cash benefits in PAYE without adding them to cash pay", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(840_000), { taxableBenefitsInKind: annual(1) }),
    );

    expect(result.annual.grossEmploymentIncome).toBe(840_001);
    expect(result.annual.grossCashPay).toBe(840_000);
    expect(result.annual.paye).toBe(6_000);
    expect(result.annual.takeHomePay).toBe(834_000);
    expect(noticeCodes(result.assumptions)).toContain(
      "NON_CASH_BENEFIT_TAX_ONLY",
    );
  });

  it("excludes genuine tax-exempt employment reimbursements from the tax test", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(1_000_000), {
        taxExemptEmploymentIncome: annual(200_000),
      }),
    );

    expect(result.annual.taxableCashEmploymentIncome).toBe(800_000);
    expect(result.decisions.minimumWageExemptionApplied).toBe(true);
    expect(result.annual.paye).toBe(0);
    expect(result.annual.takeHomePay).toBe(1_000_000);
  });
});

describe("employee pension", () => {
  it("calculates 8% only from explicitly supplied pensionable emoluments", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(6_000_000), {
        pension: {
          mode: "statutory",
          pensionableEmoluments: annual(3_000_000),
        },
      }),
    );

    expect(result.annual.employeePension).toBe(240_000);
    expect(result.decisions.pension.pensionableEmolumentsAnnual).toBe(
      3_000_000,
    );
    expect(result.decisions.pension.statutoryEmployeeContributionAnnual).toBe(
      240_000,
    );
  });

  it("uses an actual employee pension contribution and flags a rate difference", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(6_000_000), {
        pension: {
          mode: "actual",
          pensionableEmoluments: annual(3_000_000),
          employeeContribution: annual(300_000),
        },
      }),
    );

    expect(result.annual.employeePension).toBe(300_000);
    expect(noticeCodes(result.assumptions)).toContain(
      "ACTUAL_PENSION_CONTRIBUTION_USED",
    );
    expect(noticeCodes(result.warnings)).toContain(
      "PENSION_DIFFERS_FROM_STATUTORY_RATE",
    );
  });

  it.each(["employer_covers_all", "not_applicable"] as const)(
    "does not deduct employee pension for %s",
    (mode) => {
      const result = calculateNigeriaPayroll(
        inputFor(annual(2_000_000), { pension: { mode } }),
      );

      expect(result.annual.employeePension).toBe(0);
    },
  );

  it("rejects an omitted pension decision instead of assuming gross pay", () => {
    const invalid = {
      ...inputFor(annual(2_000_000)),
      pension: undefined,
    } as unknown as NigeriaPayrollInput;

    expect(() => calculateNigeriaPayroll(invalid)).toThrow(
      /pension is required/,
    );
  });
});

describe("National Housing Fund", () => {
  it("includes 2.5% for a qualifying public-sector employee by default", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(100_000), { nhf: { sector: "public" } }),
    );

    expect(result.decisions.nhf.participates).toBe(true);
    expect(result.decisions.nhf.contributionBaseAnnual).toBe(1_200_000);
    expect(result.annual.nationalHousingFund).toBe(30_000);
    expect(result.monthly.nationalHousingFund).toBe(2_500);
    expect(noticeCodes(result.assumptions)).toContain(
      "NHF_BASE_ASSUMED_GROSS_CASH",
    );
  });

  it("applies public-sector NHF at the exact minimum-wage threshold", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(70_000), { nhf: { sector: "public" } }),
    );

    expect(result.decisions.nhf.participates).toBe(true);
    expect(result.monthly.nationalHousingFund).toBe(1_750);
    expect(result.annual.paye).toBe(0);
  });

  it("does not default public-sector NHF below the minimum wage", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(69_999), { nhf: { sector: "public" } }),
    );

    expect(result.decisions.nhf.participates).toBe(false);
    expect(result.annual.nationalHousingFund).toBe(0);
  });

  it("defaults private-sector NHF to voluntary non-participation", () => {
    const result = calculateNigeriaPayroll(inputFor(monthly(100_000)));

    expect(result.decisions.nhf.participates).toBe(false);
    expect(result.annual.nationalHousingFund).toBe(0);
    expect(noticeCodes(result.assumptions)).toContain(
      "PRIVATE_NHF_NOT_INCLUDED",
    );
  });

  it("supports private-sector opt-in and an explicit contribution base", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(100_000), {
        nhf: {
          sector: "private",
          participationOverride: true,
          contributionBase: monthly(80_000),
        },
      }),
    );

    expect(result.decisions.nhf.participates).toBe(true);
    expect(result.decisions.nhf.usedParticipationOverride).toBe(true);
    expect(result.annual.nationalHousingFund).toBe(24_000);
    expect(noticeCodes(result.assumptions)).toContain("PRIVATE_NHF_OPT_IN");
  });

  it("supports an actual NHF contribution override", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(100_000), {
        nhf: {
          sector: "private",
          participationOverride: true,
          actualEmployeeContribution: monthly(1_234),
        },
      }),
    );

    expect(result.annual.nationalHousingFund).toBe(14_808);
    expect(result.decisions.nhf.usedActualContribution).toBe(true);
    expect(noticeCodes(result.assumptions)).toContain(
      "ACTUAL_NHF_CONTRIBUTION_USED",
    );
  });

  it("allows a public override but makes the statutory conflict visible", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(100_000), {
        nhf: { sector: "public", participationOverride: false },
      }),
    );

    expect(result.annual.nationalHousingFund).toBe(0);
    expect(noticeCodes(result.warnings)).toContain(
      "PUBLIC_NHF_OPT_OUT_OVERRIDE",
    );
  });

  it("makes a below-threshold public opt-in override visible", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(60_000), {
        nhf: { sector: "public", participationOverride: true },
      }),
    );

    expect(result.decisions.nhf.participates).toBe(true);
    expect(noticeCodes(result.warnings)).toContain(
      "PUBLIC_NHF_BELOW_THRESHOLD_OVERRIDE",
    );
  });

  it("warns when an explicit NHF base exceeds cash gross", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(1_000_000), {
        nhf: {
          sector: "private",
          participationOverride: true,
          contributionBase: annual(1_000_001),
        },
      }),
    );

    expect(noticeCodes(result.warnings)).toContain(
      "NHF_BASE_EXCEEDS_GROSS_CASH",
    );
  });

  it("rejects an actual contribution when participation is disabled", () => {
    expect(() =>
      calculateNigeriaPayroll(
        inputFor(monthly(100_000), {
          nhf: {
            sector: "private",
            actualEmployeeContribution: monthly(1_000),
          },
        }),
      ),
    ).toThrow(/participation is disabled/);
  });
});

describe("eligible deductions and take-home cash", () => {
  it("uses the explicit health contribution for both tax and cash deductions", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(2_000_000), {
        healthInsuranceContribution: monthly(5_000),
      }),
    );

    expect(result.annual.healthInsurance).toBe(60_000);
    expect(result.annual.totalEligibleTaxDeductions).toBe(60_000);
    expect(result.annual.chargeableIncome).toBe(1_940_000);
    expect(result.annual.paye).toBe(171_000);
    expect(result.annual.takeHomePay).toBe(1_769_000);
  });

  it("requires an explicit health contribution, including an explicit zero", () => {
    const invalid = {
      ...inputFor(annual(2_000_000)),
      healthInsuranceContribution: undefined,
    } as unknown as NigeriaPayrollInput;

    expect(() => calculateNigeriaPayroll(invalid)).toThrow(
      /healthInsuranceContribution is required/,
    );
  });

  it.each([
    [1_000_000, 200_000],
    [2_500_000, 500_000],
    [3_000_000, 500_000],
  ])(
    "calculates and caps rent relief for annual rent N%i",
    (rentPaid, expectedRelief) => {
      const result = calculateNigeriaPayroll(
        inputFor(annual(10_000_000), {
          eligibleTaxDeductions: { rentPaid: annual(rentPaid) },
        }),
      );

      expect(result.annual.rentPaid).toBe(rentPaid);
      expect(result.annual.rentRelief).toBe(expectedRelief);
      expect(noticeCodes(result.warnings)).toContain(
        "TAX_DEDUCTION_EVIDENCE_REQUIRED",
      );
    },
  );

  it("uses mortgage interest and life premiums as tax reliefs, not payroll cash deductions", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(2_000_000), {
        eligibleTaxDeductions: {
          ownerOccupiedMortgageInterest: annual(100_000),
          lifeInsuranceOrDeferredAnnuity: annual(50_000),
        },
      }),
    );

    expect(result.annual.totalEligibleTaxDeductions).toBe(150_000);
    expect(result.annual.chargeableIncome).toBe(1_850_000);
    expect(result.annual.paye).toBe(157_500);
    expect(result.annual.totalCashDeductions).toBe(157_500);
    expect(result.annual.takeHomePay).toBe(1_842_500);
  });

  it("clamps chargeable income at zero when actual reliefs exceed income", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(1_000_000), {
        eligibleTaxDeductions: {
          ownerOccupiedMortgageInterest: annual(2_000_000),
        },
      }),
    );

    expect(result.annual.chargeableIncome).toBe(0);
    expect(result.annual.paye).toBe(0);
    expect(result.annual.takeHomePay).toBe(1_000_000);
  });

  it("deducts other payroll items from cash without treating them as tax relief", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(1_000_000), {
        otherDeductions: [{ label: "Co-operative", amount: annual(120_000) }],
      }),
    );

    expect(result.annual.chargeableIncome).toBe(1_000_000);
    expect(result.annual.paye).toBe(30_000);
    expect(result.annual.otherDeductions).toBe(120_000);
    expect(result.annual.takeHomePay).toBe(850_000);
    expect(result.otherDeductionItems).toEqual([
      { label: "Co-operative", annual: 120_000, monthly: 10_000 },
    ]);
  });

  it("preserves a negative result and warns instead of hiding an underfunded payroll", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(1_000_000), {
        otherDeductions: [{ label: "Recovery", amount: annual(2_000_000) }],
      }),
    );

    expect(result.annual.takeHomePay).toBe(-1_030_000);
    expect(noticeCodes(result.warnings)).toContain("NEGATIVE_TAKE_HOME");
  });
});

describe("normalised result shape and validation", () => {
  it("produces the same annual result from equivalent monthly and annual inputs", () => {
    const monthlyResult = calculateNigeriaPayroll(
      inputFor(monthly(500_000), {
        pension: {
          mode: "statutory",
          pensionableEmoluments: monthly(200_000),
        },
        healthInsuranceContribution: monthly(5_000),
        eligibleTaxDeductions: { rentPaid: monthly(100_000) },
        otherDeductions: [{ label: "Union dues", amount: monthly(1_000) }],
      }),
    );
    const annualResult = calculateNigeriaPayroll(
      inputFor(annual(6_000_000), {
        pension: {
          mode: "statutory",
          pensionableEmoluments: annual(2_400_000),
        },
        healthInsuranceContribution: annual(60_000),
        eligibleTaxDeductions: { rentPaid: annual(1_200_000) },
        otherDeductions: [{ label: "Union dues", amount: annual(12_000) }],
      }),
    );

    expect(monthlyResult.annual).toEqual(annualResult.annual);
    expect(monthlyResult.monthly.grossCashPay).toBe(500_000);
    expect(monthlyResult.monthly.takeHomePay).toBe(
      Math.round(monthlyResult.annual.takeHomePay / 12),
    );
  });

  it("rounds every exposed money result to an integer naira", () => {
    const result = calculateNigeriaPayroll(
      inputFor(monthly(100_000.5), {
        pension: {
          mode: "statutory",
          pensionableEmoluments: annual(7),
        },
      }),
    );

    expect(result.annual.grossCashPay).toBe(1_200_012);
    expect(result.monthly.grossCashPay).toBe(100_001);
    expect(result.annual.employeePension).toBe(1);
    expect(Object.values(result.annual).every(Number.isInteger)).toBe(true);
    expect(Object.values(result.monthly).every(Number.isInteger)).toBe(true);
  });

  it("warns when pensionable emoluments exceed gross cash", () => {
    const result = calculateNigeriaPayroll(
      inputFor(annual(1_000_000), {
        pension: {
          mode: "statutory",
          pensionableEmoluments: annual(1_000_001),
        },
      }),
    );

    expect(noticeCodes(result.warnings)).toContain(
      "PENSIONABLE_EMOLUMENTS_EXCEED_GROSS_CASH",
    );
  });

  it.each([
    [{ amount: -1, period: "annual" }, /non-negative/],
    [{ amount: Number.NaN, period: "annual" }, /finite/],
    [{ amount: 1, period: "weekly" }, /monthly or annual/],
    [{ amount: 100_000_000_000, period: "monthly" }, /too large/],
  ])("rejects invalid money input %#", (grossCashPay, message) => {
    expect(() =>
      calculateNigeriaPayroll(inputFor(grossCashPay as PeriodicAmount)),
    ).toThrow(message);
  });

  it("rejects tax-exempt income above cash gross", () => {
    expect(() =>
      calculateNigeriaPayroll(
        inputFor(annual(1_000_000), {
          taxExemptEmploymentIncome: annual(1_000_001),
        }),
      ),
    ).toThrow(/cannot exceed/);
  });

  it("rejects malformed high-level payroll choices", () => {
    expect(() =>
      calculateNigeriaPayroll(null as unknown as NigeriaPayrollInput),
    ).toThrow(/payroll input is required/);

    expect(() =>
      calculateNigeriaPayroll({
        ...inputFor(annual(1_000_000)),
        pension: { mode: "unknown" },
      } as unknown as NigeriaPayrollInput),
    ).toThrow(/pension.mode/);

    expect(() =>
      calculateNigeriaPayroll({
        ...inputFor(annual(1_000_000)),
        nhf: { sector: "unknown" },
      } as unknown as NigeriaPayrollInput),
    ).toThrow(/nhf.sector/);
  });

  it("rejects malformed tax bands", () => {
    expect(() =>
      calculateProgressiveTax(1_100_000, [
        { upperBoundAnnual: null, rateBps: -1 },
      ]),
    ).toThrow(/rates/);

    expect(() =>
      calculateProgressiveTax(1_100_000, [
        { upperBoundAnnual: 1_000_000, rateBps: 1_000 },
        { upperBoundAnnual: 900_000, rateBps: 2_000 },
      ]),
    ).toThrow(/ordered/);
  });

  it("bounds and validates the other-deduction collection", () => {
    expect(() =>
      calculateNigeriaPayroll(
        inputFor(annual(1_000_000), {
          otherDeductions: Array.from({ length: 101 }, (_, index) => ({
            label: `Deduction ${index}`,
            amount: annual(1),
          })),
        }),
      ),
    ).toThrow(/more than 100/);

    expect(() =>
      calculateNigeriaPayroll(
        inputFor(annual(1_000_000), {
          otherDeductions: [
            null,
          ] as unknown as NigeriaPayrollInput["otherDeductions"],
        }),
      ),
    ).toThrow(/must be an object/);
  });

  it.each(["", " ", "x".repeat(81)])(
    "rejects an invalid deduction label",
    (label) => {
      expect(() =>
        calculateNigeriaPayroll(
          inputFor(annual(1_000_000), {
            otherDeductions: [{ label, amount: annual(1) }],
          }),
        ),
      ).toThrow(/label/);
    },
  );

  it("returns rule metadata and structured assumptions with the result", () => {
    const result = calculateNigeriaPayroll(inputFor(annual(1_000_000)));

    expect(result.currency).toBe("NGN");
    expect(result.rounding).toBe("nearest_naira");
    expect(result.rule.version).toBe("2026.1.0");
    expect(result.rule.sources.length).toBeGreaterThanOrEqual(7);
    expect(
      result.assumptions.every((notice) => notice.code && notice.message),
    ).toBe(true);
  });
});
