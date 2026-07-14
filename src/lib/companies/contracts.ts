import { z } from "zod";

import { externalHttpsUrlSchema } from "@/lib/security/url-schema";

const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/);
const publicEvidenceCountrySchema = z.union([
  countryCodeSchema,
  z.literal("WITHHELD"),
]);
const timestampSchema = z.string().datetime({ offset: true });
const fivePointRatingSchema = z.coerce.number().min(1).max(5);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);
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

export const companyLocationSchema = z.object({
  country_code: countryCodeSchema,
  city: z.string().max(160).nullable().optional(),
  region: z.string().max(160).nullable().optional(),
  location_type: z.string().max(80).optional(),
  is_primary: z.boolean().optional(),
  last_verified_at: timestampSchema.nullable().optional(),
});

const legalEntitySchema = z.object({
  legal_name: boundedText(240),
  registration_country: countryCodeSchema.nullable(),
  entity_status: boundedText(80),
  citation_id: z.string().uuid(),
});
const aliasSchema = z.object({
  alias: boundedText(240),
  alias_kind: z.enum([
    "brand_alias",
    "former_name",
    "trading_name",
    "subsidiary",
  ]),
  citation_id: z.string().uuid().nullable(),
});
const officialDomainSchema = z
  .object({
    domain: domainSchema,
    domain_kind: z.enum(["corporate", "careers", "subsidiary"]),
    verified_at: timestampSchema,
    review_due_at: timestampSchema,
    citation_id: z.string().uuid(),
  })
  .superRefine((domain, context) => {
    if (Date.parse(domain.review_due_at) < Date.parse(domain.verified_at)) {
      context.addIssue({
        code: "custom",
        path: ["review_due_at"],
        message: "Domain review cannot be due before verification.",
      });
    }
  });
export const companyCitationSchema = z
  .object({
    id: z.string().uuid(),
    fact_key: z.enum([
      "brand_name",
      "legal_name",
      "alias",
      "official_domain",
      "office",
      "headquarters_country",
      "industry",
      "website",
      "size_band",
      "employer_description",
      "employer_benefit",
      "employer_policy",
    ]),
    source_kind: z.enum([
      "official_site",
      "public_filing",
      "public_registry",
      "verified_employer_submission",
    ]),
    source_url: externalHttpsUrlSchema,
    source_title: boundedText(300),
    source_published_at: z.iso.date().nullable(),
    retrieved_at: timestampSchema,
    fact_checked_at: timestampSchema,
    review_due_at: timestampSchema,
    status: z.enum(["current", "review_due"]),
  })
  .superRefine((citation, context) => {
    const retrievedAt = Date.parse(citation.retrieved_at);
    const factCheckedAt = Date.parse(citation.fact_checked_at);
    const reviewDueAt = Date.parse(citation.review_due_at);
    if (
      citation.source_published_at !== null &&
      Date.parse(citation.source_published_at) > retrievedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_published_at"],
        message: "Source publication cannot postdate retrieval.",
      });
    }
    if (retrievedAt > factCheckedAt) {
      context.addIssue({
        code: "custom",
        path: ["fact_checked_at"],
        message: "Fact checking cannot predate retrieval.",
      });
    }
    if (reviewDueAt < factCheckedAt) {
      context.addIssue({
        code: "custom",
        path: ["review_due_at"],
        message: "Evidence review cannot be due before fact checking.",
      });
    }
  });

export const companyRowSchema = z
  .object({
    id: z.string().uuid(),
    slug: slugSchema,
    display_name: boundedText(200),
    website_url: externalHttpsUrlSchema.nullable(),
    industry: z.string().max(200).nullable(),
    size_band: z.string().max(100).nullable(),
    description: z.string().max(5_000).nullable(),
    headquarters_country: countryCodeSchema.nullable(),
    verification_status: z.enum([
      "unverified",
      "domain_verified",
      "organization_verified",
      "suspended",
    ]),
    updated_at: timestampSchema,
    locations: z.array(companyLocationSchema).max(100).default([]),
    legal_entities: z.array(legalEntitySchema).max(100).default([]),
    aliases: z.array(aliasSchema).max(100).default([]),
    official_domains: z.array(officialDomainSchema).max(100).default([]),
    citations: z.array(companyCitationSchema).max(100).default([]),
  })
  .superRefine((company, context) => {
    const citationIds = new Set<string>();
    company.citations.forEach((citation, index) => {
      if (citationIds.has(citation.id)) {
        context.addIssue({
          code: "custom",
          path: ["citations", index, "id"],
          message: "Company citation IDs must be unique.",
        });
      }
      citationIds.add(citation.id);
    });

    const domains = new Set<string>();
    company.official_domains.forEach((domain, index) => {
      if (domains.has(domain.domain)) {
        context.addIssue({
          code: "custom",
          path: ["official_domains", index, "domain"],
          message: "Official company domains must be unique.",
        });
      }
      domains.add(domain.domain);
      if (!citationIds.has(domain.citation_id)) {
        context.addIssue({
          code: "custom",
          path: ["official_domains", index, "citation_id"],
          message: "Official domains must reference published evidence.",
        });
      }
    });

    company.legal_entities.forEach((entity, index) => {
      if (!citationIds.has(entity.citation_id)) {
        context.addIssue({
          code: "custom",
          path: ["legal_entities", index, "citation_id"],
          message: "Legal entities must reference published evidence.",
        });
      }
    });
  });

export const reviewSchema = z.object({
  id: z.string().uuid(),
  company_slug: z.string(),
  role_family: z.string().nullable(),
  country_code: publicEvidenceCountrySchema,
  employment_status: z.string().nullable(),
  employment_period_label: z.string().nullable(),
  compensation_rating: fivePointRatingSchema.int().nullable(),
  pay_reliability_rating: fivePointRatingSchema.int().nullable(),
  management_rating: fivePointRatingSchema.int().nullable(),
  work_life_rating: fivePointRatingSchema.int().nullable(),
  career_growth_rating: fivePointRatingSchema.int().nullable(),
  overall_rating: fivePointRatingSchema.nullable(),
  pros: z.string().max(5_000).nullable(),
  cons: z.string().max(5_000).nullable(),
  advice_to_management: z.string().max(5_000).nullable(),
  published_at: timestampSchema,
  provenance_label: z.string(),
});

export const interviewSchema = z.object({
  id: z.string().uuid(),
  company_slug: z.string(),
  role_family: z.string().nullable(),
  seniority: z.string().nullable(),
  country_code: publicEvidenceCountrySchema,
  application_source: z.string().nullable(),
  stages: z.array(z.string().max(200)).max(30).default([]),
  approximate_duration_label: z.string().nullable(),
  difficulty: fivePointRatingSchema.int().nullable(),
  feedback_received: z.boolean().nullable(),
  outcome: z.string().nullable(),
  question_themes: z.string().max(5_000).nullable(),
  general_experience: z.string().max(5_000).nullable(),
  published_at: timestampSchema,
  provenance_label: z.string(),
});

export const ratingSchema = z
  .object({
    company_slug: slugSchema,
    sample_size: z.coerce.number().int().min(5),
    independent_contributors: z.coerce.number().int().min(5).optional(),
    overall_rating: fivePointRatingSchema,
    confidence_label: z.enum(["low", "medium", "high"]),
    country_scope: z.array(countryCodeSchema).max(60).optional(),
    source_month_from: z.iso.date().nullable().optional(),
    source_month_to: z.iso.date().nullable().optional(),
    verification_mix: z
      .record(z.string(), z.coerce.number().int().nonnegative())
      .optional(),
    computed_at: timestampSchema,
  })
  .superRefine((rating, context) => {
    if (
      rating.independent_contributors !== undefined &&
      rating.independent_contributors > rating.sample_size
    ) {
      context.addIssue({
        code: "custom",
        path: ["independent_contributors"],
        message: "Independent contributors cannot exceed the sample.",
      });
    }
    if (
      (rating.source_month_from === null) !==
      (rating.source_month_to === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_month_to"],
        message: "Rating evidence months must be supplied together.",
      });
    } else if (
      rating.source_month_from &&
      rating.source_month_to &&
      rating.source_month_from > rating.source_month_to
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_month_to"],
        message: "Rating evidence end month cannot precede its start month.",
      });
    }
  });

export const benefitSchema = z
  .object({
    id: z.string().uuid(),
    company_slug: slugSchema,
    benefit_code: z.string().trim().min(1).max(80),
    label: boundedText(200),
    description: z.string().max(5_000).nullable(),
    source_kind: z.string().trim().min(1).max(80),
    sample_size: z.coerce.number().int().nonnegative().nullable(),
    confidence_label: z.enum(["low", "medium", "high"]).nullable(),
    last_verified_at: timestampSchema.nullable(),
    country_code: countryCodeSchema.nullable().optional(),
    source_month_from: z.iso.date().nullable().optional(),
    source_month_to: z.iso.date().nullable().optional(),
    verification_mix: z
      .record(z.string(), z.coerce.number().int().nonnegative())
      .optional(),
  })
  .superRefine((benefit, context) => {
    if (
      (benefit.source_month_from === null) !==
      (benefit.source_month_to === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_month_to"],
        message: "Benefit evidence months must be supplied together.",
      });
    } else if (
      benefit.source_month_from &&
      benefit.source_month_to &&
      benefit.source_month_from > benefit.source_month_to
    ) {
      context.addIssue({
        code: "custom",
        path: ["source_month_to"],
        message: "Benefit evidence end month cannot precede its start month.",
      });
    }
  });

export const employerResponseSchema = z
  .object({
    id: z.string().uuid(),
    company_slug: slugSchema,
    response_kind: z.enum(["factual_correction", "right_of_reply"]),
    statement: z.string().trim().min(20).max(3_000),
    source_url: externalHttpsUrlSchema.nullable(),
    published_at: timestampSchema,
    updated_at: timestampSchema,
    provenance_label: boundedText(300),
  })
  .superRefine((response, context) => {
    if (Date.parse(response.updated_at) < Date.parse(response.published_at)) {
      context.addIssue({
        code: "custom",
        path: ["updated_at"],
        message: "Employer response updates cannot predate publication.",
      });
    }
  });

export const companyRatingThresholdSchema = z.object({
  metric: z.literal("company_overall_rating"),
  min_distinct_contributors: z.coerce.number().int().min(5),
});

export const companyEvidenceRowSchema = z.object({
  company_slug: slugSchema.nullable(),
  published_at: timestampSchema.nullable().optional(),
  computed_at: timestampSchema.nullable().optional(),
  calculated_at: timestampSchema.nullable().optional(),
  last_verified_at: timestampSchema.nullable().optional(),
  source_kind: z.string().optional(),
});

export type CompanyLocation = z.infer<typeof companyLocationSchema>;
export type CompanyRow = z.infer<typeof companyRowSchema>;
export type CompanyLegalEntity = z.infer<typeof legalEntitySchema>;
export type CompanyAlias = z.infer<typeof aliasSchema>;
export type CompanyOfficialDomain = z.infer<typeof officialDomainSchema>;
export type CompanyCitation = z.infer<typeof companyCitationSchema>;
export type CompanyReview = z.infer<typeof reviewSchema>;
export type InterviewExperience = z.infer<typeof interviewSchema>;
export type CompanyRating = z.infer<typeof ratingSchema>;
export type CompanyBenefit = z.infer<typeof benefitSchema>;
export type EmployerResponse = z.infer<typeof employerResponseSchema>;
