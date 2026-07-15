import { z } from "zod";

const optionalAmount = z.union([
  z.literal(""),
  z
    .string()
    .regex(/^\d{1,12}(?:\.\d{1,2})?$/, "Enter a plain amount, digits only."),
]);

const experienceLevel = z.enum([
  "unspecified",
  "entry",
  "junior",
  "mid",
  "senior",
  "lead",
  "executive",
]);

const workArrangement = z.enum(["unspecified", "remote", "hybrid", "onsite"]);

const payPeriod = z.enum(["hourly", "daily", "weekly", "monthly", "annual"]);

/**
 * The form posts strings; unselected optionals arrive as "" and an unchecked
 * checkbox does not arrive at all. Every field here is a claim the account owner
 * makes about themselves, so nothing is defaulted to a substantive value —
 * absent stays absent.
 */
export const candidateProfileFormSchema = z
  .object({
    headline: z.union([z.literal(""), z.string().trim().min(2).max(160)]),
    summary: z.union([z.literal(""), z.string().trim().max(5_000)]),
    years_experience: z.union([
      z.literal(""),
      z.string().regex(/^\d{1,2}$/, "Enter a whole number of years."),
    ]),
    experience_level: experienceLevel,
    desired_work_arrangement: workArrangement,
    desired_salary_min: optionalAmount,
    desired_salary_max: optionalAmount,
    desired_currency_code: z.union([
      z.literal(""),
      z
        .string()
        .trim()
        .toUpperCase()
        .pipe(z.string().regex(/^[A-Z]{3}$/)),
    ]),
    desired_pay_period: z.union([z.literal(""), payPeriod]),
    location_country: z.union([
      z.literal(""),
      z
        .string()
        .trim()
        .toUpperCase()
        .pipe(z.string().regex(/^[A-Z]{2}$/)),
    ]),
    open_to_relocation: z.literal("on").optional(),
  })
  .superRefine((value, context) => {
    const min = value.desired_salary_min;
    const max = value.desired_salary_max;

    if (min !== "" && max !== "" && Number(max) < Number(min)) {
      context.addIssue({
        code: "custom",
        path: ["desired_salary_max"],
        message: "Maximum pay expectation cannot be below the minimum.",
      });
    }

    // Mirrors the candidate_salary_needs_units database constraint. Catching it
    // here turns a constraint violation into an ordinary form rejection.
    const hasAmount = min !== "" || max !== "";
    if (
      hasAmount &&
      (value.desired_currency_code === "" || value.desired_pay_period === "")
    ) {
      context.addIssue({
        code: "custom",
        path: ["desired_currency_code"],
        message: "A pay expectation needs both a currency and a pay period.",
      });
    }

    const yearsOutOfRange =
      value.years_experience !== "" && Number(value.years_experience) > 60;
    if (yearsOutOfRange) {
      context.addIssue({
        code: "custom",
        path: ["years_experience"],
        message: "Enter 60 years or fewer.",
      });
    }
  });

export type CandidateProfileForm = z.infer<typeof candidateProfileFormSchema>;

/**
 * Payload for `api.save_my_candidate_profile`. Absent claims are omitted rather
 * than sent as empty values. Declared as a type alias, not an interface, so it
 * carries the implicit index signature the generated `Json` argument requires.
 */
export type CandidateProfilePayload = {
  headline?: string;
  summary?: string;
  years_experience?: number;
  experience_level: string;
  desired_work_arrangement: string;
  desired_salary_min?: number;
  desired_salary_max?: number;
  desired_currency_code?: string;
  desired_pay_period?: string;
  location_country?: string;
  open_to_relocation: boolean;
};

function omitEmpty(value: string): string | undefined {
  return value === "" ? undefined : value;
}

function omitEmptyNumber(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

export function toCandidateProfilePayload(
  form: CandidateProfileForm,
): CandidateProfilePayload {
  return {
    headline: omitEmpty(form.headline),
    summary: omitEmpty(form.summary),
    years_experience: omitEmptyNumber(form.years_experience),
    experience_level: form.experience_level,
    desired_work_arrangement: form.desired_work_arrangement,
    desired_salary_min: omitEmptyNumber(form.desired_salary_min),
    desired_salary_max: omitEmptyNumber(form.desired_salary_max),
    desired_currency_code: omitEmpty(form.desired_currency_code),
    desired_pay_period: omitEmpty(form.desired_pay_period),
    location_country: omitEmpty(form.location_country),
    open_to_relocation: form.open_to_relocation === "on",
  };
}
