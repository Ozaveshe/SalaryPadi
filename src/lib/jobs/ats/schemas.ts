import { z } from "zod";

const MAX_PROVIDER_RECORDS = 2_000;
const shortText = z.string().trim().min(1).max(500);
const longText = z.string().max(500_000);
const httpsUrl = z.string().url().max(2_048);
const providerDate = z.string().datetime({ offset: true, local: true });

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

export type GreenhouseJob = z.infer<typeof greenhouseJobSchema>;
export type LeverJob = z.infer<typeof leverJobSchema>;
export type AshbyJob = z.infer<typeof ashbyJobSchema>;
export type GreenhousePayload = z.infer<typeof greenhousePayloadSchema>;
export type LeverPayload = z.infer<typeof leverPayloadSchema>;
export type AshbyPayload = z.infer<typeof ashbyPayloadSchema>;
