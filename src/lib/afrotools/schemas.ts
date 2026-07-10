import { z } from "zod";

const periodicAmount = z.object({
  amount: z.number().finite().min(0).max(1_000_000_000_000),
  period: z.enum(["monthly", "annual"]),
});

const moneyInput = z.object({
  amount: z.number().finite().min(0).max(1_000_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  payPeriod: z.enum([
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "annual",
    "one_time",
  ]),
  periodsPerYear: z.number().finite().positive().max(100_000).optional(),
});

const offer = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  basePay: moneyInput,
  payBasis: z.enum(["gross", "net"]),
  variablePay: z
    .array(
      z.object({
        kind: z.enum(["bonus", "commission", "thirteenth_month", "other"]),
        label: z.string().max(120).optional(),
        value: moneyInput,
        guaranteed: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  benefits: z
    .array(
      z.object({
        kind: z.enum([
          "pension",
          "health",
          "transport",
          "housing",
          "lunch",
          "data",
          "paid_leave",
          "equipment",
          "other",
        ]),
        label: z.string().max(120).optional(),
        value: moneyInput,
      }),
    )
    .max(30)
    .optional(),
  personalCosts: z
    .array(
      z.object({
        kind: z.enum([
          "remote_work",
          "electricity",
          "commute",
          "transfer",
          "exchange",
          "other",
        ]),
        label: z.string().max(120).optional(),
        value: moneyInput,
      }),
    )
    .max(30)
    .optional(),
  estimatedDeductions: z
    .array(
      z.object({
        label: z.string().min(1).max(120),
        value: moneyInput,
      }),
    )
    .max(30)
    .optional(),
  terms: z.object({
    arrangement: z.enum([
      "employee",
      "contractor",
      "freelance",
      "fixed_term",
      "internship",
      "other",
    ]),
    workMode: z.enum(["remote", "hybrid", "onsite", "flexible"]).optional(),
    paidLeaveDays: z.number().finite().min(0).max(366).optional(),
    equipmentProvided: z.array(z.string().min(1).max(80)).max(20).optional(),
    commuteHoursPerWeek: z.number().finite().min(0).max(168).optional(),
    contractTermMonths: z.number().finite().min(0).max(1200).optional(),
    noticePeriodDays: z.number().finite().min(0).max(3650).optional(),
  }),
});

export const offerCompareRequestSchema = z.object({
  consent: z.literal(true),
  input: z.object({
    offerA: offer,
    offerB: offer,
    comparisonCurrency: z.string().regex(/^[A-Z]{3}$/),
    fxRates: z
      .array(
        z.object({
          from: z.string().regex(/^[A-Z]{3}$/),
          to: z.string().regex(/^[A-Z]{3}$/),
          rate: z.number().finite().positive(),
          asOf: z.string().max(40).optional(),
          sourceLabel: z.string().max(120).optional(),
        }),
      )
      .max(20)
      .optional(),
  }),
});

export const scamCheckRequestSchema = z.object({
  consent: z.literal(true),
  input: z.object({
    vacancyText: z.string().max(20_000).optional(),
    answers: z
      .object({
        employerName: z.string().max(160).optional(),
        recruiterEmail: z.string().max(320).optional(),
        officialEmployerDomain: z.string().max(253).optional(),
        trustedApplicationDomains: z
          .array(z.string().max(253))
          .max(10)
          .optional(),
        applicationUrl: z.string().max(2048).optional(),
        feeRequested: z.boolean().optional(),
        feePurpose: z
          .enum(["application", "training", "equipment", "other"])
          .optional(),
        interviewChannel: z
          .enum(["video_or_phone", "in_person", "messaging_only", "unknown"])
          .optional(),
        compensationSeemsUnrealistic: z.boolean().optional(),
        employerIdentityIsClear: z.boolean().optional(),
        offerMadeWithoutAssessment: z.boolean().optional(),
        bankingCredentialsRequested: z.boolean().optional(),
        unnecessaryIdentityDocumentsRequested: z.boolean().optional(),
        cryptocurrencyRequested: z.boolean().optional(),
        pressureOrUrgency: z.boolean().optional(),
        domainAppearsMisspelled: z.boolean().optional(),
        applicationLinkRelatedToEmployer: z.boolean().optional(),
      })
      .optional(),
  }),
});

export const payrollRequestSchema = z.object({
  consent: z.literal(true),
  input: z.object({
    calculationDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    grossCashPay: periodicAmount,
    pension: z.discriminatedUnion("mode", [
      z.object({
        mode: z.literal("statutory"),
        pensionableEmoluments: periodicAmount,
      }),
      z.object({
        mode: z.literal("actual"),
        pensionableEmoluments: periodicAmount,
        employeeContribution: periodicAmount,
      }),
      z.object({ mode: z.literal("employer_covers_all") }),
      z.object({ mode: z.literal("not_applicable") }),
    ]),
    nhf: z.object({
      sector: z.enum(["public", "private"]),
      participationOverride: z.boolean().optional(),
      contributionBase: periodicAmount.optional(),
      actualEmployeeContribution: periodicAmount.optional(),
    }),
    healthInsuranceContribution: periodicAmount,
    taxExemptEmploymentIncome: periodicAmount.optional(),
    taxableBenefitsInKind: periodicAmount.optional(),
    eligibleTaxDeductions: z
      .object({
        ownerOccupiedMortgageInterest: periodicAmount.optional(),
        lifeInsuranceOrDeferredAnnuity: periodicAmount.optional(),
        rentPaid: periodicAmount.optional(),
      })
      .optional(),
    otherDeductions: z
      .array(
        z.object({ label: z.string().min(1).max(120), amount: periodicAmount }),
      )
      .max(100)
      .optional(),
  }),
});
