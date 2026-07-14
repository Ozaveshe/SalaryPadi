import { z } from "zod";

import catalog from "../../../data/companies/africa-major-companies.v1.json";
import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

const slugSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const domainSchema = z
  .string()
  .min(1)
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
const companySchema = z
  .object({
    rank: z.number().int().positive().max(1_000),
    slug: slugSchema,
    name: z.string().trim().min(1).max(200),
    sector: z.string().trim().min(1).max(200),
    marketCountryCode: z.string().regex(/^[A-Z]{2}$/),
    marketCountry: z.string().trim().min(1).max(100),
    region: z.enum([
      "north_africa",
      "east_africa",
      "west_africa",
      "central_africa",
      "southern_africa",
    ]),
    website: externalHttpsUrlSchema,
    domain: domainSchema,
    officialSourceUrl: externalHttpsUrlSchema,
    officialSourceTitle: z.string().trim().min(1).max(300),
  })
  .strict();

const selectionSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: externalHttpsUrlSchema,
    dataAsOf: z.iso.date(),
    methodology: z.string().trim().min(1).max(2_000),
  })
  .strict();

const catalogSchema = z
  .object({
    catalogVersion: z.string().trim().min(1).max(40),
    generatedAt: z.iso.datetime({ offset: true }),
    reviewDueAt: z.iso.datetime({ offset: true }),
    selectionSource: selectionSchema,
    logoStrategy: z
      .object({
        provider: z.literal("logo.dev"),
        lookup: z.literal("official_domain"),
        publicRoute: z.literal("/api/company-logos/{slug}"),
        fallback: z.literal("deterministic_monogram"),
        verification: z.string().trim().min(1).max(500),
      })
      .strict(),
    companies: z.array(companySchema).min(1).max(500),
  })
  .strict()
  .superRefine((value, context) => {
    for (const key of ["rank", "slug", "domain"] as const) {
      const unique = new Set(value.companies.map((company) => company[key]))
        .size;
      if (unique === value.companies.length) continue;
      context.addIssue({
        code: "custom",
        path: ["companies"],
        message: `Company catalog contains a duplicate ${key}.`,
      });
    }
    if (Date.parse(value.generatedAt) > Date.parse(value.reviewDueAt)) {
      context.addIssue({
        code: "custom",
        path: ["reviewDueAt"],
        message: "Catalog review date precedes its generation date.",
      });
    }
  });

export type AfricanCompanyCatalogEntry = z.infer<typeof companySchema>;
export type AfricanCompanySelection = z.infer<typeof selectionSchema>;

const parsedCatalog = catalogSchema.parse(catalog);
const entries = parsedCatalog.companies;
const entriesBySlug = new Map(entries.map((entry) => [entry.slug, entry]));

export function getAfricanCompanyCatalog() {
  return entries;
}

export function getAfricanCompanyCatalogEntry(slug: string) {
  return entriesBySlug.get(slug) ?? null;
}

export function getAfricanCompanySelection() {
  return parsedCatalog.selectionSource;
}
