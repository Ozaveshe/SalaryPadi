import { z } from "zod";

const optional = (max: number) =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().trim().max(max).optional(),
  );
const optionalMoney = z.preprocess(
  (value) => (value === "" || value === undefined ? undefined : value),
  z.coerce.number().nonnegative().max(10_000_000_000).optional(),
);

export const employerJobSubmissionSchema = z
  .object({
    company_name: z.string().trim().min(2).max(180),
    corporate_email: z.string().email().max(254),
    company_website: z
      .string()
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Use an HTTPS company website.",
      ),
    title: z.string().trim().min(2).max(200),
    description: z.string().trim().min(100).max(20_000),
    requirements: z.string().trim().min(20).max(10_000),
    benefits: optional(5_000),
    location: z.string().trim().min(2).max(200),
    work_mode: z.enum(["remote", "hybrid", "onsite"]),
    employment_type: z.enum([
      "full_time",
      "part_time",
      "contract",
      "temporary",
      "internship",
      "freelance",
    ]),
    arrangement: z.enum(["employee", "contractor", "freelance"]),
    experience_level: z.enum(["entry", "mid", "senior", "lead", "executive"]),
    eligibility_scope: z.enum([
      "worldwide",
      "africa",
      "emea",
      "nigeria",
      "named_countries",
      "restricted_region",
      "unclear",
    ]),
    included_countries: optional(1_000),
    excluded_countries: optional(1_000),
    eligibility_evidence: z.string().trim().min(5).max(2_000),
    timezone_overlap: optional(300),
    work_authorization: optional(500),
    visa_sponsorship: z.enum(["yes", "no", "unclear"]),
    relocation_support: z.enum(["yes", "no", "unclear"]).default("unclear"),
    salary_minimum: optionalMoney,
    salary_maximum: optionalMoney,
    currency: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .regex(/^[A-Z]{3}$/)
        .optional(),
    ),
    pay_period: z.enum([
      "hourly",
      "daily",
      "weekly",
      "monthly",
      "annual",
      "unknown",
    ]),
    gross_net: z.enum(["gross", "net", "unknown"]),
    application_url: z
      .string()
      .url()
      .refine(
        (value) => new URL(value).protocol === "https:",
        "Use an HTTPS application URL.",
      ),
    deadline: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().date().optional(),
    ),
    authorization_attestation: z.literal("on"),
  })
  .superRefine((value, context) => {
    if (
      value.salary_minimum !== undefined &&
      value.salary_maximum !== undefined &&
      value.salary_maximum < value.salary_minimum
    ) {
      context.addIssue({
        code: "custom",
        path: ["salary_maximum"],
        message: "Maximum salary must be at least the minimum.",
      });
    }
    if (
      (value.salary_minimum !== undefined ||
        value.salary_maximum !== undefined) &&
      !value.currency
    ) {
      context.addIssue({
        code: "custom",
        path: ["currency"],
        message: "Currency is required when salary is supplied.",
      });
    }
  });

const freeEmailDomains = new Set([
  "gmail.com",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "proton.me",
  "protonmail.com",
]);

export function assessCorporateEmail(email: string, website: string) {
  const emailDomain = email.toLowerCase().split("@").at(-1) ?? "";
  const websiteDomain = new URL(website).hostname
    .toLowerCase()
    .replace(/^www\./, "");
  return {
    emailDomain,
    websiteDomain,
    isFreeProvider: freeEmailDomains.has(emailDomain),
    domainMatches:
      emailDomain === websiteDomain ||
      emailDomain.endsWith(`.${websiteDomain}`),
  };
}
