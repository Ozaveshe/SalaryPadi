import { z } from "zod";

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required.`).max(max);
const optionalText = (max: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );
const optionalMoney = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().nonnegative().max(10_000_000_000).optional(),
);
const rating = z.coerce.number().int().min(1).max(5);
const yesNoUnknown = z.enum(["yes", "no", "unclear", "not_applicable"]);

export const contributionKindSchema = z.enum([
  "salary",
  "review",
  "interview",
  "benefits",
  "pay_reliability",
]);

export function containsLikelyPrivateContact(value: string) {
  return (
    /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value) ||
    /(?:\+?\d[\s().-]*){8,}/.test(value)
  );
}

export function containsProhibitedDocumentField(formData: FormData) {
  for (const [key, value] of formData.entries()) {
    if (
      (typeof File !== "undefined" && value instanceof File) ||
      /(?:payslip|pay_slip|document|attachment|verification_evidence|work_email)/i.test(
        key,
      )
    ) {
      return true;
    }
  }
  return false;
}

function noPrivateContact<T extends z.ZodTypeAny>(schema: T, fields: string[]) {
  return schema.superRefine((value, context) => {
    const record = value as Record<string, unknown>;
    for (const field of fields) {
      const text = record[field];
      if (typeof text === "string" && containsLikelyPrivateContact(text)) {
        context.addIssue({
          code: "custom",
          path: [field],
          message:
            "Remove email addresses and phone numbers before submitting.",
        });
      }
    }
  });
}

export const salaryContributionSchema = z.object({
  role: requiredText("Role", 160),
  role_family: requiredText("Role family", 120),
  company: optionalText(180),
  country: z
    .string()
    .length(2)
    .transform((value) => value.toUpperCase()),
  city: optionalText(120),
  work_mode: z.enum(["remote", "hybrid", "onsite"]),
  employment_type: z.enum([
    "full_time",
    "part_time",
    "contract",
    "internship",
    "freelance",
  ]),
  arrangement: z.enum(["employee", "contractor", "freelance"]),
  seniority: z.enum(["entry", "mid", "senior", "lead", "executive"]),
  years_experience: z.coerce.number().min(0).max(60),
  base_salary: z.coerce.number().positive().max(10_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  pay_period: z.enum(["hourly", "daily", "weekly", "monthly", "annual"]),
  gross_net: z.enum(["gross", "net"]),
  bonus: optionalMoney,
  commission: optionalMoney,
  equity: optionalText(300),
  pension: optionalMoney,
  health_cover: optionalMoney,
  transport: optionalMoney,
  housing: optionalMoney,
  lunch: optionalMoney,
  data_airtime: optionalMoney,
  power_allowance: optionalMoney,
  thirteenth_month: optionalMoney,
  other_benefits: optionalText(500),
  payment_reliability: z.enum([
    "always_on_time",
    "usually_on_time",
    "sometimes_late",
    "often_late",
    "prefer_not_to_say",
  ]),
  foreign_currency_policy: optionalText(500),
  accuracy_attestation: z.literal("on"),
});

const reviewBase = z.object({
  company: requiredText("Company", 180),
  compensation_rating: rating,
  pay_reliability_rating: rating,
  management_rating: rating,
  work_life_rating: rating,
  growth_rating: rating,
  job_security_rating: rating,
  pension_compliance: z.enum(["yes", "no", "unclear", "not_applicable"]),
  health_cover: z.enum(["yes", "no", "unclear", "not_applicable"]),
  leave_quality: rating,
  overtime_expectation: z.enum(["rare", "sometimes", "frequent", "unclear"]),
  weekend_work: z.enum(["never", "sometimes", "frequent", "unclear"]),
  remote_reality: optionalText(500),
  support_provided: optionalText(500),
  inclusion_rating: rating,
  safety_rating: rating,
  pros: requiredText("Pros", 2_000),
  cons: requiredText("Cons", 2_000),
  advice: optionalText(1_500),
  employment_status: z.enum(["current", "former"]),
  role_family: requiredText("Role family", 120),
  employment_period: z.enum([
    "under_6_months",
    "6_to_12_months",
    "1_to_2_years",
    "2_to_5_years",
    "over_5_years",
  ]),
  anonymity_attestation: z.literal("on"),
});
export const reviewContributionSchema = noPrivateContact(reviewBase, [
  "pros",
  "cons",
  "advice",
  "remote_reality",
  "support_provided",
]);

const interviewBase = z.object({
  company: requiredText("Company", 180),
  role_family: requiredText("Role family", 120),
  seniority: z.enum(["entry", "mid", "senior", "lead", "executive"]),
  country: z
    .string()
    .length(2)
    .transform((value) => value.toUpperCase()),
  application_source: requiredText("Application source", 160),
  stages: requiredText("Interview stages", 2_000),
  assessment: optionalText(1_000),
  duration: z.enum([
    "under_1_week",
    "1_to_2_weeks",
    "2_to_4_weeks",
    "1_to_2_months",
    "over_2_months",
  ]),
  difficulty: rating,
  feedback_received: z.enum(["yes", "no", "partial"]),
  outcome: z.enum(["offer", "rejected", "withdrawn", "ghosted", "in_progress"]),
  question_themes: optionalText(1_500),
  general_experience: requiredText("General experience", 2_000),
  confidentiality_attestation: z.literal("on"),
});
export const interviewContributionSchema = noPrivateContact(interviewBase, [
  "stages",
  "assessment",
  "question_themes",
  "general_experience",
]);

export const benefitsContributionSchema = noPrivateContact(
  z.object({
    company: requiredText("Company", 180),
    country: z
      .string()
      .length(2)
      .transform((value) => value.toUpperCase()),
    employment_status: z.enum(["current", "former"]),
    pension: yesNoUnknown,
    hmo: yesNoUnknown,
    transport: yesNoUnknown,
    housing: yesNoUnknown,
    data_power: yesNoUnknown,
    thirteenth_month: yesNoUnknown,
    bonus: yesNoUnknown,
    overtime_expectation: z.enum(["rare", "sometimes", "frequent", "unclear"]),
    weekend_work: z.enum(["never", "sometimes", "frequent", "unclear"]),
    context: optionalText(700),
    accuracy_attestation: z.literal("on"),
  }),
  ["context"],
);

export const payReliabilityContributionSchema = noPrivateContact(
  z.object({
    company: requiredText("Company", 180),
    country: z
      .string()
      .length(2)
      .transform((value) => value.toUpperCase()),
    employment_status: z.enum(["current", "former"]),
    observation_window: z.enum([
      "under_3_months",
      "3_to_6_months",
      "6_to_12_months",
      "over_12_months",
    ]),
    on_time_frequency: z.enum([
      "always_on_time",
      "usually_on_time",
      "sometimes_late",
      "often_late",
    ]),
    longest_delay: z.enum([
      "none",
      "under_1_week",
      "1_to_4_weeks",
      "over_1_month",
    ]),
    arrears_resolved: z.enum([
      "not_applicable",
      "yes",
      "partly",
      "no",
      "unclear",
    ]),
    fx_policy: optionalText(500),
    context: optionalText(700),
    accuracy_attestation: z.literal("on"),
  }),
  ["fx_policy", "context"],
);

export const contributionSchemas = {
  salary: salaryContributionSchema,
  review: reviewContributionSchema,
  interview: interviewContributionSchema,
  benefits: benefitsContributionSchema,
  pay_reliability: payReliabilityContributionSchema,
} as const;

export type ContributionKind = z.infer<typeof contributionKindSchema>;
