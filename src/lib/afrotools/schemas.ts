import { z } from "zod";

import type { OfferComparisonResult } from "@/lib/offers";
import type { ScamCheckResult } from "@/lib/scam";

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

const responseText = z.string().max(10_000);
const responseTextList = z.array(responseText).max(100);
const responseCurrency = z.string().regex(/^[A-Z]{3}$/);
const finiteAmount = z.number().finite();

const normalizedAmountResponseSchema = z.object({
  currency: responseCurrency,
  monthly: finiteAmount,
  annual: finiteAmount,
});

const offerTermsResponseSchema = z.object({
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
});

const normalizedOfferResponseSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  payBasis: z.enum(["gross", "net"]),
  comparisonCurrency: responseCurrency,
  basePay: normalizedAmountResponseSchema,
  guaranteedCashCompensation: normalizedAmountResponseSchema,
  nonGuaranteedCashCompensation: normalizedAmountResponseSchema,
  totalCashCompensation: normalizedAmountResponseSchema,
  estimatedBenefitValue: normalizedAmountResponseSchema,
  personalWorkCosts: normalizedAmountResponseSchema,
  estimatedDeductions: normalizedAmountResponseSchema.nullable(),
  estimatedCashTakeHome: normalizedAmountResponseSchema.nullable(),
  totalCompensation: normalizedAmountResponseSchema,
  effectiveValue: normalizedAmountResponseSchema,
  effectiveTakeHomeValue: normalizedAmountResponseSchema.nullable(),
  terms: offerTermsResponseSchema,
  warnings: responseTextList,
});

const amountDifferenceResponseSchema = z.object({
  currency: responseCurrency,
  monthly: finiteAmount.nullable(),
  annual: finiteAmount.nullable(),
  leader: z.enum(["offer_a", "offer_b", "tie", "unknown"]),
});

const offerDifferencesResponseSchema = z.object({
  basePay: amountDifferenceResponseSchema,
  guaranteedCashCompensation: amountDifferenceResponseSchema,
  nonGuaranteedCashCompensation: amountDifferenceResponseSchema,
  totalCashCompensation: amountDifferenceResponseSchema,
  estimatedBenefitValue: amountDifferenceResponseSchema,
  personalWorkCosts: amountDifferenceResponseSchema,
  estimatedDeductions: amountDifferenceResponseSchema,
  estimatedCashTakeHome: amountDifferenceResponseSchema,
  totalCompensation: amountDifferenceResponseSchema,
  effectiveValue: amountDifferenceResponseSchema,
  effectiveTakeHomeValue: amountDifferenceResponseSchema,
});

export const offerComparisonResultResponseSchema: z.ZodType<OfferComparisonResult> =
  z.object({
    comparisonCurrency: responseCurrency,
    offerA: normalizedOfferResponseSchema,
    offerB: normalizedOfferResponseSchema,
    differences: offerDifferencesResponseSchema,
    nonFinancialDifferences: z
      .array(
        z.object({
          kind: z.enum([
            "arrangement",
            "work_mode",
            "paid_leave",
            "equipment",
            "commute_time",
            "contract_term",
            "notice_period",
          ]),
          offerA: responseText,
          offerB: responseText,
          summary: responseText,
        }),
      )
      .max(100),
    negotiationTalkingPoints: z
      .array(
        z.object({
          kind: z.enum([
            "guaranteed_cash_gap",
            "variable_pay_clarity",
            "benefit_gap",
            "work_cost_gap",
            "transfer_cost",
            "take_home_unknown",
            "contract_difference",
            "paid_leave_gap",
            "commute_gap",
            "equipment_gap",
          ]),
          title: responseText,
          evidence: responseText,
          suggestion: responseText,
        }),
      )
      .max(100),
    normalizationNotes: responseTextList,
  });

export const afroToolsOfferCompareResponseSchema = z.object({
  status: z.literal("success"),
  result: offerComparisonResultResponseSchema,
});

const scamWarningFlagResponseSchema = z.object({
  code: z.enum([
    "upfront_payment",
    "training_or_equipment_fee",
    "personal_email_domain",
    "suspicious_domain",
    "messaging_only_interview",
    "unrealistic_compensation",
    "vague_employer_identity",
    "instant_offer",
    "banking_credentials",
    "unnecessary_identity_documents",
    "cryptocurrency_request",
    "urgency_pressure",
    "unrelated_application_link",
  ]),
  severity: z.enum(["caution", "high"]),
  title: responseText,
  whyItMatters: responseText,
  evidence: responseTextList,
  source: z.enum(["text", "answers", "both"]),
  verificationSteps: responseTextList,
});

export const scamCheckResultResponseSchema: z.ZodType<ScamCheckResult> =
  z.object({
    riskTier: z.enum(["lower_indication", "caution", "high_caution"]),
    riskLabel: responseText,
    summary: responseText,
    flags: z.array(scamWarningFlagResponseSchema).max(100),
    verificationSteps: responseTextList,
    safeNextActions: responseTextList,
    limitations: responseTextList,
    inputCoverage: z.object({
      textAnalyzed: z.boolean(),
      structuredAnswersProvided: z.number().int().min(0).max(100),
      urlFetchPerformed: z.literal(false),
    }),
  });

export const afroToolsScamCheckResponseSchema = z.object({
  status: z.literal("success"),
  result: scamCheckResultResponseSchema,
});
