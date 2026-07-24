import { z } from "zod";

/**
 * ReliefWeb jobs API v1 payload shapes, restricted to the fields the
 * application source-policy registry permits (id, url, title, source,
 * country, closing date, job type, career category). Everything else the
 * provider returns is ignored at the schema boundary.
 */

const identifierSchema = z
  .union([z.number().int().nonnegative(), z.string().trim().min(1).max(120)])
  .transform(String);

const namedTermSchema = z
  .object({ name: z.string().trim().min(1).max(300) })
  .passthrough();

const reliefWebDateSchema = z
  .object({
    created: z.string().datetime({ offset: true }),
    closing: z.string().datetime({ offset: true }).nullish(),
  })
  .passthrough();

export const reliefWebJobFieldsSchema = z
  .object({
    id: identifierSchema.optional(),
    title: z.string().trim().min(1).max(300),
    url: z.string().url().max(2_048),
    date: reliefWebDateSchema,
    source: z.array(namedTermSchema).min(1).max(20),
    country: z.array(namedTermSchema).max(60).default([]),
    type: z.array(namedTermSchema).max(20).default([]),
    career_categories: z.array(namedTermSchema).max(20).default([]),
  })
  .passthrough();

export const reliefWebJobSchema = z
  .object({
    id: identifierSchema,
    fields: reliefWebJobFieldsSchema,
  })
  .passthrough();

export const reliefWebResponseSchema = z
  .object({
    totalCount: z.number().int().nonnegative().optional(),
    count: z.number().int().nonnegative().optional(),
    data: z.array(reliefWebJobSchema).max(200),
  })
  .passthrough();

export type ReliefWebJob = z.infer<typeof reliefWebJobSchema>;
export type ReliefWebResponse = z.infer<typeof reliefWebResponseSchema>;
