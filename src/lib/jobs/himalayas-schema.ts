import { z } from "zod";

const unixTimestamp = z.number().int().positive().max(4_102_444_800);
const optionalSalary = z
  .number()
  .finite()
  .positive()
  .max(10_000_000_000)
  .nullish();
const shortStringList = z.array(z.string().trim().min(1).max(160)).max(80);
const locationRestrictionList = z
  .array(z.string().trim().min(1).max(160))
  .max(250);

export const himalayasJobSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    excerpt: z.string().max(5_000),
    companyName: z.string().trim().min(1).max(300),
    companySlug: z.string().trim().min(1).max(160),
    employmentType: z.string().trim().min(1).max(80),
    minSalary: optionalSalary,
    maxSalary: optionalSalary,
    salaryPeriod: z.string().trim().min(1).max(40),
    seniority: shortStringList,
    currency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .nullish(),
    locationRestrictions: locationRestrictionList.optional().default([]),
    timezoneRestrictions: z
      .array(z.union([z.string().trim().min(1).max(20), z.number().finite()]))
      .max(40)
      .optional()
      .default([]),
    categories: shortStringList,
    parentCategories: shortStringList,
    pubDate: unixTimestamp,
    expiryDate: unixTimestamp,
    applicationLink: z.string().url().max(2_048),
    guid: z.string().url().max(2_048),
  })
  .passthrough();

export const himalayasResponseSchema = z
  .object({
    updatedAt: unixTimestamp,
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive().max(20),
    totalCount: z.number().int().nonnegative(),
    jobs: z.array(himalayasJobSchema).max(20),
  })
  .passthrough();

export type HimalayasJob = z.infer<typeof himalayasJobSchema>;
export type HimalayasResponse = z.infer<typeof himalayasResponseSchema>;
