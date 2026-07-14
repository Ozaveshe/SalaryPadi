import { z } from "zod";

export const remotiveJobSchema = z.object({
  id: z.number().int().nonnegative(),
  url: z.string().url().max(2_048),
  title: z.string().trim().min(1).max(300),
  company_name: z.string().trim().min(1).max(300),
  company_logo: z.string().max(2_048).nullish(),
  company_logo_url: z.string().max(2_048).nullish(),
  category: z.string().trim().max(160).nullish(),
  tags: z.array(z.string().trim().min(1).max(100)).max(100).default([]),
  job_type: z.string().trim().max(100).nullish(),
  publication_date: z
    .string()
    .datetime({ offset: true, local: true })
    .transform((value) =>
      /(?:z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`,
    ),
  candidate_required_location: z.string().trim().max(500).nullish(),
  salary: z.string().trim().max(300).nullish(),
  description: z.string().max(500_000),
});

export const remotiveResponseSchema = z.object({
  "job-count": z.number().int().nonnegative().optional(),
  jobs: z.array(remotiveJobSchema).max(2_000),
});

export type RemotiveJob = z.infer<typeof remotiveJobSchema>;
export type RemotiveResponse = z.infer<typeof remotiveResponseSchema>;
