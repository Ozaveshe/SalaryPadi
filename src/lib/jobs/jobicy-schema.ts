import { z } from "zod";

const identifierSchema = z
  .union([z.number().int().nonnegative(), z.string().trim().min(1).max(120)])
  .transform(String);
const optionalNumber = z
  .union([z.number().finite(), z.string().trim().min(1).max(40)])
  .transform((value, context) => {
    const parsed = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(parsed)) {
      context.addIssue({ code: "custom", message: "Expected a finite number" });
      return z.NEVER;
    }
    return parsed;
  })
  .nullish();
const stringList = z
  .union([
    z
      .string()
      .trim()
      .min(1)
      .max(160)
      .transform((value) => [value]),
    z.array(z.string().trim().min(1).max(160)).max(30),
  ])
  .default([]);

export const jobicyJobSchema = z
  .object({
    id: identifierSchema,
    url: z.string().url().max(2_048),
    jobTitle: z.string().trim().min(1).max(300),
    companyName: z.string().trim().min(1).max(300),
    jobIndustry: stringList,
    jobType: stringList,
    jobGeo: z.string().trim().min(1).max(500),
    jobLevel: z.string().trim().max(160).nullish(),
    jobExcerpt: z.string().max(20_000).nullish(),
    pubDate: z.string().datetime({ offset: true }),
    salaryMin: optionalNumber,
    salaryMax: optionalNumber,
    salaryCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{3}$/)
      .nullish(),
    salaryPeriod: z.string().trim().max(40).nullish(),
  })
  .passthrough();

export const jobicyResponseSchema = z
  .object({
    jobCount: z.number().int().nonnegative().optional(),
    jobs: z.array(jobicyJobSchema).max(100),
  })
  .passthrough();

export type JobicyJob = z.infer<typeof jobicyJobSchema>;
export type JobicyResponse = z.infer<typeof jobicyResponseSchema>;
