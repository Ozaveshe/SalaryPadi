import type { NigeriaPayrollRuleSet } from "./types";

export const NIGERIA_PAYROLL_RULES_2026: NigeriaPayrollRuleSet = {
  id: "ng-payroll-nta-2025-v1",
  version: "2026.1.0",
  jurisdiction: "NG",
  currency: "NGN",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  reviewedThrough: "2026-07-10",
  rounding: "nearest_naira",
  minimumWage: {
    monthly: 70_000,
    annual: 840_000,
  },
  payeBands: [
    { upperBoundAnnual: 800_000, rateBps: 0 },
    { upperBoundAnnual: 3_000_000, rateBps: 1_500 },
    { upperBoundAnnual: 12_000_000, rateBps: 1_800 },
    { upperBoundAnnual: 25_000_000, rateBps: 2_100 },
    { upperBoundAnnual: 50_000_000, rateBps: 2_300 },
    { upperBoundAnnual: null, rateBps: 2_500 },
  ],
  pension: {
    employeeRateBps: 800,
    employerRateBps: 1_000,
    minimumPensionableComponents: ["basic", "housing", "transport"],
  },
  nhf: {
    employeeRateBps: 250,
    publicSectorMandatoryAtMinimumWage: true,
    privateSectorVoluntary: true,
  },
  healthInsurance: {
    nationalDefaultEmployeeRateBps: null,
  },
  rentRelief: {
    rateBps: 2_000,
    maximumAnnual: 500_000,
  },
  eligibleDeductionCodes: [
    "employee_pension",
    "employee_nhf",
    "employee_health_insurance",
    "owner_occupied_mortgage_interest",
    "life_insurance_or_deferred_annuity",
    "rent_relief",
  ],
  caveats: [
    "This rule set estimates resident individual employment PAYE and is not personal tax advice.",
    "Pensionable emoluments must come from the employment terms and cannot be inferred safely from gross pay.",
    "The NHF amendment uses monthly income as its base; callers may provide the employer's actual contribution base or contribution.",
    "Health-insurance employee rates are scheme and state specific, so the engine never supplies a national default rate.",
    "PenCom materials conflict on an employer bearing the entire pension contribution; this engine only calculates the employee cash deduction.",
    "Tax deductions depend on qualifying amounts actually paid and may require a written claim and supporting evidence.",
    "The result is an annualised estimate; employer payroll timing, cumulative true-ups and per-period rounding can cause small differences.",
  ],
  sources: [
    {
      id: "nigeria-tax-act-2025",
      title: "Nigeria Tax Act, 2025",
      authority: "National Assembly of the Federal Republic of Nigeria",
      url: "https://nass.gov.ng/documents/download/11249",
      supports: [
        "2026 commencement",
        "employment income and benefits in kind",
        "eligible deductions and rent relief",
        "minimum-wage exemption",
        "individual income-tax bands",
      ],
    },
    {
      id: "tax-acts-transition-guidance-2025",
      title: "Federal Government Transition Guidelines for Tax Acts, 2025",
      authority: "Federal Ministry of Finance",
      url: "https://finance.gov.ng/federal-government-issues-transition-guidelines-for-tax-acts-2025/",
      supports: ["Nigeria Tax Act effective from 1 January 2026"],
    },
    {
      id: "nigeria-tax-administration-act-2025",
      title: "Nigeria Tax Administration Act, 2025",
      authority: "National Assembly of the Federal Republic of Nigeria",
      url: "https://nass.gov.ng/documents/download/11250",
      supports: [
        "PAYE annual liability and employer withholding administration",
      ],
    },
    {
      id: "national-minimum-wage-2024",
      title: "President's address confirming the signed N70,000 minimum wage",
      authority: "The State House, Abuja",
      url: "https://statehouse.gov.ng/president-tinubus-broadcast-on-the-nationwide-protest/",
      supports: ["current national minimum wage of N70,000 per month"],
    },
    {
      id: "pension-reform-act-2014",
      title: "Pension Reform Act, 2014",
      authority: "National Pension Commission",
      url: "https://www.pencom.gov.ng/wp-content/uploads/2018/01/PRA_2014.pdf",
      supports: [
        "employee and employer pension duties",
        "pensionable emoluments",
      ],
    },
    {
      id: "pencom-faq-2023",
      title: "Frequently Asked Questions on the Contributory Pension Scheme",
      authority: "National Pension Commission",
      url: "https://www.pencom.gov.ng/wp-content/uploads/2023/09/FREQUENTLY-ASKED-QUESTIONS-2023.pdf",
      supports: [
        "8% employee contribution",
        "10% employer contribution",
        "monthly emoluments definition",
      ],
    },
    {
      id: "business-facilitation-act-2022",
      title: "Business Facilitation (Miscellaneous Provisions) Act, 2022",
      authority:
        "Federal Republic of Nigeria Official Gazette, mirrored by WIPO Lex",
      url: "https://www.wipo.int/wipolex/en/legislation/details/21826",
      supports: [
        "NHF public-sector requirement",
        "NHF private-sector voluntary participation",
        "2.5% monthly-income rate",
      ],
    },
    {
      id: "nhia-act-2022",
      title: "National Health Insurance Authority Act, 2022",
      authority: "National Health Insurance Authority",
      url: "https://www.nhia.gov.ng/wp-content/uploads/2024/03/NHIA-Act-2022-Gazetted-Copy.pdf",
      supports: [
        "state and scheme determination of formal-sector contribution rates",
      ],
    },
  ],
};

export const NIGERIA_PAYROLL_RULE_SETS: readonly NigeriaPayrollRuleSet[] = [
  NIGERIA_PAYROLL_RULES_2026,
];

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(value: string): void {
  if (!isoDatePattern.test(value)) {
    throw new TypeError("calculationDate must use YYYY-MM-DD format");
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.valueOf()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new TypeError("calculationDate must be a valid calendar date");
  }
}

export function resolveNigeriaPayrollRules(
  calculationDate: string,
): NigeriaPayrollRuleSet {
  assertIsoDate(calculationDate);

  const matchingRules = NIGERIA_PAYROLL_RULE_SETS.filter(
    (rule) =>
      rule.effectiveFrom <= calculationDate &&
      (rule.effectiveTo === null || calculationDate <= rule.effectiveTo),
  ).sort((left, right) =>
    left.effectiveFrom.localeCompare(right.effectiveFrom),
  );

  const rule = matchingRules.at(-1);
  if (!rule) {
    throw new RangeError(
      `No Nigeria payroll rule set covers ${calculationDate}`,
    );
  }

  return rule;
}
