import { z } from "zod";

import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

const MAX_PROVIDER_RECORDS = 2_000;
const shortText = z.string().trim().min(1).max(500);
const longText = z.string().max(500_000);
const httpsUrl = externalHttpsUrlSchema;
const providerDate = z.string().datetime({ offset: true, local: true });
/*
 * A posting date becomes `app.jobs.posted_at`, so it has to name an instant.
 * An offset-less local datetime would have to be resolved against a timezone
 * the provider never states, which is a guess, not evidence.
 */
const providerInstant = z.string().datetime({ offset: true });

/*
 * Provider objects intentionally use passthrough semantics. ATS APIs add
 * fields frequently; adapters validate only fields SalaryPadi actually reads.
 */
const greenhouseDepartmentSchema = z.object({ name: shortText }).passthrough();

export const greenhouseJobSchema = z
  .object({
    id: z.number().int().nonnegative(),
    internal_job_id: z.number().int().nonnegative().nullable().optional(),
    title: shortText,
    updated_at: providerDate,
    /*
     * Greenhouse's board API returns the date the role was first published on
     * the job list itself, so recording it costs no additional request. It is
     * optional because the field is absent on boards that predate it; a job
     * without it is left without a posting date rather than given one.
     */
    first_published: providerInstant.nullable().optional(),
    location: z.object({ name: shortText }).passthrough(),
    absolute_url: httpsUrl,
    content: longText.optional(),
    departments: z.array(greenhouseDepartmentSchema).max(1_000).optional(),
  })
  .passthrough();

export const greenhousePayloadSchema = z
  .object({
    jobs: z.array(z.unknown()).max(MAX_PROVIDER_RECORDS),
    meta: z
      .object({ total: z.number().int().nonnegative().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const leverCategoriesSchema = z
  .object({
    location: z.string().trim().max(500).optional(),
    commitment: z.string().trim().max(100).optional(),
    team: z.string().trim().max(300).optional(),
    department: z.string().trim().max(300).optional(),
  })
  .passthrough();

export const leverJobSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    text: shortText,
    categories: leverCategoriesSchema,
    createdAt: z.number().int().nonnegative().optional(),
    description: longText.optional(),
    descriptionPlain: longText.optional(),
    hostedUrl: httpsUrl,
    applyUrl: httpsUrl,
    workplaceType: z
      .enum(["unspecified", "onsite", "on-site", "remote", "hybrid"])
      .optional(),
  })
  .passthrough();

export const leverPayloadSchema = z
  .array(z.unknown())
  .max(MAX_PROVIDER_RECORDS);

const ashbyCompensationComponentSchema = z
  .object({
    compensationType: z.string().trim().min(1).max(100),
    interval: z.string().trim().min(1).max(100),
    currencyCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    minValue: z.number().finite().nonnegative().nullable(),
    maxValue: z.number().finite().nonnegative().nullable(),
  })
  .passthrough();

const ashbyCompensationSchema = z
  .object({
    scrapeableCompensationSalarySummary: z
      .string()
      .trim()
      .min(1)
      .max(2_000)
      .optional(),
    summaryComponents: z
      .array(ashbyCompensationComponentSchema)
      .max(100)
      .optional(),
  })
  .passthrough();

export const ashbyJobSchema = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    title: shortText,
    location: z.string().trim().max(500),
    department: z.string().trim().max(300).optional(),
    team: z.string().trim().max(300).optional(),
    isListed: z.boolean(),
    workplaceType: z.enum(["OnSite", "Remote", "Hybrid"]),
    descriptionHtml: longText,
    descriptionPlain: longText,
    publishedAt: providerDate,
    employmentType: z.enum([
      "FullTime",
      "PartTime",
      "Intern",
      "Contract",
      "Temporary",
    ]),
    compensation: ashbyCompensationSchema.nullable().optional(),
    jobUrl: httpsUrl,
    applyUrl: httpsUrl,
  })
  .passthrough();

export const ashbyPayloadSchema = z
  .object({
    apiVersion: z.literal("1"),
    jobs: z.array(z.unknown()).max(MAX_PROVIDER_RECORDS),
  })
  .passthrough();

const workableLocationSchema = z
  .object({
    country: z.string().trim().max(200).nullable().optional(),
    countryCode: z.string().trim().max(10).nullable().optional(),
    city: z.string().trim().max(200).nullable().optional(),
    region: z.string().trim().max(200).nullable().optional(),
  })
  .passthrough();

export const workableJobSchema = z
  .object({
    title: shortText,
    shortcode: z.string().trim().min(1).max(100),
    employment_type: z.string().trim().max(100).nullable().optional(),
    telecommuting: z.boolean().optional(),
    department: z.string().trim().max(300).nullable().optional(),
    url: httpsUrl,
    application_url: httpsUrl,
    published_on: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    country: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().max(200).nullable().optional(),
    state: z.string().trim().max(200).nullable().optional(),
    locations: z.array(workableLocationSchema).max(50).optional(),
  })
  .passthrough();

export const workablePayloadSchema = z
  .object({
    name: z.string().trim().max(300).optional(),
    jobs: z.array(z.unknown()).max(MAX_PROVIDER_RECORDS),
  })
  .passthrough();

export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;
export type LeverJob = z.infer<typeof leverJobSchema>;
export type AshbyJob = z.infer<typeof ashbyJobSchema>;
export type WorkableJob = z.infer<typeof workableJobSchema>;
export type WorkablePayload = z.infer<typeof workablePayloadSchema>;
export type GreenhousePayload = z.infer<typeof greenhousePayloadSchema>;
export type LeverPayload = z.infer<typeof leverPayloadSchema>;
export type AshbyPayload = z.infer<typeof ashbyPayloadSchema>;
